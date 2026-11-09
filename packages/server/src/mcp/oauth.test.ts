import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { describe, expect, it } from "vite-plus/test";

import { configLayer } from "../config.ts";
import { SecretEncryption } from "../crypto/secret-encryption.ts";
import { GatewayDatabase, layer as databaseLayer } from "../db/database.ts";
import { layer as environmentRepositoryLayer } from "../db/environment-repository.ts";
import { layer as grantRepositoryLayer } from "../db/mcp-grant-repository.ts";
import { McpGrants, layer as grantsLayer } from "./grants.ts";
import { layer as oauthLayer, McpOAuth, mcpOAuthUrls } from "./oauth.ts";

const urls = mcpOAuthUrls("https://gateway.example.com");

const foundation = Layer.mergeAll(
  configLayer.pipe(
    Layer.provide(
      ConfigProvider.layer(ConfigProvider.fromUnknown({ T3_GATEWAY_DATABASE_PATH: ":memory:" })),
    ),
  ),
  NodeCrypto.layer,
  NodeServices.layer,
  // Client ids only need to round-trip here, not to be sealed.
  Layer.succeed(
    SecretEncryption,
    SecretEncryption.of({
      encrypt: (plaintext) => Effect.succeed(Buffer.from(plaintext)),
      decrypt: (ciphertext) => Effect.succeed(ciphertext.toString()),
    }),
  ),
);
const repositories = Layer.mergeAll(environmentRepositoryLayer, grantRepositoryLayer).pipe(
  Layer.provideMerge(databaseLayer),
);
const testLayer = oauthLayer.pipe(
  Layer.provideMerge(grantsLayer),
  Layer.provideMerge(repositories),
  Layer.provideMerge(foundation),
);

const run = <A, E>(
  effect: Effect.Effect<A, E, McpOAuth | McpGrants | GatewayDatabase | Crypto.Crypto>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* (yield* GatewayDatabase).runMigrations;
      return yield* effect;
    }).pipe(Effect.provide(Layer.merge(testLayer, TestClock.layer()))),
  );

/** Registers a client and walks it through the authorization code flow. */
const signIn = Effect.gen(function* () {
  const oauth = yield* McpOAuth;
  const crypto = yield* Crypto.Crypto;
  const verifier = Base64Url.encode(yield* crypto.randomBytes(32));
  const challenge = Base64Url.encode(
    yield* crypto.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const client = yield* oauth.register({ redirect_uris: ["http://127.0.0.1/callback"] });
  const authorization = yield* oauth.validateAuthorization(urls, {
    response_type: "code",
    client_id: client.clientId,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const redirect = yield* oauth.decide({
    urls,
    authorization,
    decision: { _tag: "Approve", label: "test", access: "read-only", environmentIds: null },
    userId: null,
  });
  const tokens = yield* oauth.exchange(urls, {
    grant_type: "authorization_code",
    code: new URL(redirect).searchParams.get("code") ?? "",
    client_id: client.clientId,
    code_verifier: verifier,
  });
  return { clientId: client.clientId, tokens };
});

const refresh = (clientId: string, refreshToken: string) =>
  McpOAuth.use((oauth) =>
    oauth.exchange(urls, {
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    }),
  );

describe("refresh_token grant", () => {
  it("returns the same refresh token on every refresh, with working access tokens", () =>
    run(
      Effect.gen(function* () {
        const grants = yield* McpGrants;
        const { clientId, tokens } = yield* signIn;

        const first = yield* refresh(clientId, tokens.refresh_token);
        const second = yield* refresh(clientId, tokens.refresh_token);

        expect(first.refresh_token).toBe(tokens.refresh_token);
        expect(second.refresh_token).toBe(tokens.refresh_token);
        expect(new Set([tokens.access_token, first.access_token, second.access_token]).size).toBe(
          3,
        );
        for (const accessToken of [tokens.access_token, first.access_token, second.access_token]) {
          expect(yield* grants.authenticate(accessToken)).not.toBeNull();
        }
      }),
    ));

  it("refuses a refresh token after it expires", () =>
    run(
      Effect.gen(function* () {
        const { clientId, tokens } = yield* signIn;
        yield* TestClock.adjust("89 days");
        yield* refresh(clientId, tokens.refresh_token);
        yield* TestClock.adjust("1 day");

        const error = yield* Effect.flip(refresh(clientId, tokens.refresh_token));
        expect(error).toMatchObject({ error: "invalid_grant" });
      }),
    ));

  it("refuses a revoked refresh token", () =>
    run(
      Effect.gen(function* () {
        const { clientId, tokens } = yield* signIn;
        yield* McpOAuth.use((oauth) => oauth.revoke(tokens.refresh_token));

        const error = yield* Effect.flip(refresh(clientId, tokens.refresh_token));
        expect(error).toMatchObject({ error: "invalid_grant" });
      }),
    ));
});
