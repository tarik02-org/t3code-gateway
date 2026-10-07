import type { McpAccess } from "@t3code-gateway/contracts/schemas";
import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Semaphore from "effect/Semaphore";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { SecretEncryption } from "../crypto/secret-encryption.ts";
import { EnvironmentRepository } from "../db/environment-repository.ts";
import { DatabaseError } from "../db/errors.ts";
import {
  McpUpstreamCredentialRepository,
  type McpUpstreamCredentialRow,
} from "../db/mcp-upstream-credential-repository.ts";
import { AdminTokenRotation } from "../environments/admin-token-rotation.ts";
import {
  ADMIN_TOKEN_SWEEP_CONCURRENCY,
  ADMIN_TOKEN_SWEEP_TIMEOUT,
} from "../environments/constants.ts";
import { createMcpClientToken, revokeClientSession } from "../environments/t3code-client.ts";

// T3 Code issues `mcp-client` tokens for 30 days with no refresh grant, so the gateway signs in again.
const ROTATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
// Relay requests ask for tokens on demand; a failing environment is retried at most this often.
const FAILURE_BACKOFF = "1 minute";

const credentialLabel = (access: McpAccess) => `T3 Code Gateway relay (${access})`;

const parseIso = (value: string | null) =>
  value === null ? null : Option.getOrNull(DateTime.make(value));

const secretFailure = (error: { readonly message: string }) =>
  new DatabaseError({ operation: "mcpCredential", reason: "unknown", cause: error });

export class McpUpstreamCredentials extends Context.Service<
  McpUpstreamCredentials,
  {
    /** A usable `mcp-client` token for the environment, signing in or rotating as needed. */
    readonly ensure: (
      environmentId: string,
      access: McpAccess,
    ) => Effect.Effect<string, EnvironmentFailure | DatabaseError>;
    /** Rotates every stored credential that is due. */
    readonly sweep: Effect.Effect<void>;
    /** Signs the gateway's MCP sessions out of an environment before it is removed. */
    readonly revokeEnvironment: (environmentId: string) => Effect.Effect<void>;
  }
>()("@t3code-gateway/server/mcp/upstream-credentials/McpUpstreamCredentials") {}

export const make = Effect.gen(function* () {
  const environmentRepository = yield* EnvironmentRepository;
  const credentialRepository = yield* McpUpstreamCredentialRepository;
  const adminTokens = yield* AdminTokenRotation;
  const secrets = yield* SecretEncryption;
  const client = yield* HttpClient.HttpClient;
  const crypto = yield* Crypto.Crypto;
  const locks = new Map<string, Semaphore.Semaphore>();

  const revokeSession = (environmentId: string, endpoint: string, sessionId: string) =>
    adminTokens.ensureFresh(environmentId).pipe(
      Effect.flatMap((adminToken) => revokeClientSession(client, endpoint, adminToken, sessionId)),
      Effect.asVoid,
      Effect.catchTags({
        EnvironmentFailure: (error) =>
          Effect.logWarning("Could not revoke replaced MCP relay session").pipe(
            Effect.annotateLogs({ environmentId, reason: error.message }),
          ),
        DatabaseError: (error) =>
          Effect.logError("Could not revoke replaced MCP relay session").pipe(
            Effect.annotateLogs({ environmentId, reason: error.message }),
          ),
      }),
    );

  /** The stored token while it has not expired. */
  const currentToken = (row: McpUpstreamCredentialRow | undefined, now: DateTime.Utc) =>
    Effect.gen(function* () {
      const expiresAt = parseIso(row?.expiresAt ?? null);
      if (
        row?.tokenEncrypted == null ||
        expiresAt === null ||
        DateTime.isLessThanOrEqualTo(expiresAt, now)
      ) {
        return null;
      }
      const token = yield* secrets.decrypt(row.tokenEncrypted).pipe(Effect.mapError(secretFailure));
      return { token, expiresAt, sessionId: row.sessionId };
    });

  const maintain = Effect.fn("McpUpstreamCredentials.maintain")(function* (
    environmentId: string,
    access: McpAccess,
  ) {
    const environment = yield* environmentRepository.findEnvironment(environmentId);
    if (environment === undefined) {
      return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
    }
    if (!environment.enabled) {
      return yield* new EnvironmentFailure({ message: "Environment is disabled" });
    }

    const row = yield* credentialRepository.findCredential(environmentId, access);
    const now = yield* DateTime.now;
    const current = yield* currentToken(row, now);
    if (
      current !== null &&
      DateTime.isGreaterThan(
        DateTime.subtract(current.expiresAt, { milliseconds: ROTATION_WINDOW_MS }),
        now,
      )
    ) {
      return current.token;
    }

    const lastAttemptAt = parseIso(row?.lastAttemptAt ?? null);
    if (
      row?.lastFailure != null &&
      lastAttemptAt !== null &&
      DateTime.isLessThan(now, DateTime.addDuration(lastAttemptAt, FAILURE_BACKOFF))
    ) {
      if (current !== null) {
        return current.token;
      }
      return yield* new EnvironmentFailure({ message: row.lastFailure });
    }

    const signIn = Effect.gen(function* () {
      const adminToken = yield* adminTokens.ensureFresh(environmentId);
      const minted = yield* createMcpClientToken(client, environment.endpoint, adminToken, {
        label: credentialLabel(access),
        access,
      }).pipe(Effect.provideService(Crypto.Crypto, crypto));
      const tokenEncrypted = yield* secrets
        .encrypt(minted.accessToken)
        .pipe(Effect.mapError(secretFailure));
      yield* credentialRepository.saveToken(environmentId, access, {
        tokenEncrypted,
        sessionId: minted.sessionId,
        expiresAt: DateTime.formatIso(minted.expiresAt),
        attemptedAt: DateTime.formatIso(yield* DateTime.now),
      });
      yield* Effect.logInfo("Signed MCP relay in to environment").pipe(
        Effect.annotateLogs({
          environmentId,
          access,
          expiresAt: DateTime.formatIso(minted.expiresAt),
        }),
      );
      if (current?.sessionId != null) {
        yield* revokeSession(environmentId, environment.endpoint, current.sessionId);
      }
      return minted.accessToken;
    });

    return yield* signIn.pipe(
      Effect.catchTag("EnvironmentFailure", (error) =>
        Effect.gen(function* () {
          yield* credentialRepository.recordFailure(environmentId, access, {
            message: error.message,
            attemptedAt: DateTime.formatIso(yield* DateTime.now),
          });
          yield* Effect.logWarning("MCP relay sign-in failed").pipe(
            Effect.annotateLogs({ environmentId, access, reason: error.message }),
          );
          if (current !== null) {
            return current.token;
          }
          return yield* error;
        }),
      ),
    );
  });

  const ensure = (environmentId: string, access: McpAccess) => {
    const key = `${environmentId}\u0000${access}`;
    let lock = locks.get(key);
    if (lock === undefined) {
      lock = Semaphore.makeUnsafe(1);
      locks.set(key, lock);
    }
    return lock.withPermit(maintain(environmentId, access));
  };

  const sweep = Effect.gen(function* () {
    const environments = yield* environmentRepository.listEnvironments;
    const enabled = new Set(
      environments.filter((environment) => environment.enabled).map((row) => row.environmentId),
    );
    const credentials = yield* credentialRepository.listCredentials;
    yield* Effect.forEach(
      credentials.filter((row) => enabled.has(row.environmentId)),
      (row) =>
        ensure(row.environmentId, row.access).pipe(
          Effect.timeout(ADMIN_TOKEN_SWEEP_TIMEOUT),
          Effect.asVoid,
          Effect.catchTags({
            DatabaseError: (error) =>
              Effect.logError("MCP relay credential sweep failed").pipe(
                Effect.annotateLogs({ environmentId: row.environmentId, reason: error.message }),
              ),
            // Already recorded on the credential and logged by `maintain`.
            EnvironmentFailure: () => Effect.void,
            TimeoutError: () =>
              Effect.logWarning("MCP relay credential sweep timed out").pipe(
                Effect.annotateLogs({ environmentId: row.environmentId, access: row.access }),
              ),
          }),
        ),
      { concurrency: ADMIN_TOKEN_SWEEP_CONCURRENCY, discard: true },
    );
  }).pipe(
    Effect.catchTag("DatabaseError", (error) =>
      Effect.logError("Could not load MCP relay credentials for sweep").pipe(
        Effect.annotateLogs({ reason: error.message }),
      ),
    ),
  );

  const revokeEnvironment = (environmentId: string) =>
    Effect.gen(function* () {
      const environment = yield* environmentRepository.findEnvironment(environmentId);
      if (environment === undefined) {
        return;
      }
      const credentials = yield* credentialRepository.listEnvironmentCredentials(environmentId);
      yield* Effect.forEach(
        credentials.flatMap((row) => (row.sessionId === null ? [] : [row.sessionId])),
        (sessionId) => revokeSession(environmentId, environment.endpoint, sessionId),
        { discard: true },
      );
    }).pipe(
      Effect.catchTag("DatabaseError", (error) =>
        Effect.logError("Could not load MCP relay credentials to revoke").pipe(
          Effect.annotateLogs({ environmentId, reason: error.message }),
        ),
      ),
    );

  return McpUpstreamCredentials.of({ ensure, sweep, revokeEnvironment });
});

export const layer = Layer.effect(McpUpstreamCredentials, make);
