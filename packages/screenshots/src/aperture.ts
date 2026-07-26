import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { captureScreenshots } from "./capture.ts";

const ApertureAuthResponse = Schema.Struct({
  principal: Schema.Struct({
    authorityType: Schema.Literals(["system_admin", "tenant"]),
  }),
});

const ApertureBrowserChannelsResponse = Schema.Struct({
  channels: Schema.Array(
    Schema.Struct({
      name: Schema.String,
    }),
  ),
});

const ApertureCreateSessionResponse = Schema.Struct({
  session: Schema.Struct({
    id: Schema.String,
  }),
  cdpUrl: Schema.URLFromString,
  sessionToken: Schema.String,
});

const ApertureCdpDiscoveryResponse = Schema.Struct({
  webSocketDebuggerUrl: Schema.URLFromString,
});

class ApertureTenantRequiredError extends Schema.TaggedErrorClass<ApertureTenantRequiredError>()(
  "ApertureTenantRequiredError",
  { message: Schema.String },
) {}

class ApertureChromiumUnavailableError extends Schema.TaggedErrorClass<ApertureChromiumUnavailableError>()(
  "ApertureChromiumUnavailableError",
  { message: Schema.String },
) {}

export interface CaptureScreenshotsWithApertureInput {
  readonly baseUrl: URL;
  readonly token: Redacted.Redacted<string>;
  readonly tenantId: Option.Option<string>;
  readonly distDirectory: string;
  readonly output: string;
}

export const captureScreenshotsWithAperture = Effect.fn("screenshots.aperture.capture")(function* ({
  baseUrl,
  token,
  tenantId,
  distDirectory,
  output,
}: CaptureScreenshotsWithApertureInput) {
  const httpClient = yield* HttpClient.HttpClient;
  const authenticatedClient = httpClient.pipe(
    HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
    HttpClient.filterStatusOk,
  );
  const auth = yield* authenticatedClient
    .get(new URL("/api/auth/me", baseUrl))
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(ApertureAuthResponse)));

  let apiClient = authenticatedClient;
  if (auth.principal.authorityType === "system_admin") {
    const selectedTenantId = yield* Option.match(tenantId, {
      onNone: () =>
        Effect.fail(
          new ApertureTenantRequiredError({
            message: "A system-admin Aperture token requires --tenant-id.",
          }),
        ),
      onSome: Effect.succeed,
    });
    apiClient = authenticatedClient.pipe(
      HttpClient.mapRequest(HttpClientRequest.setHeader("X-Aperture-Tenant-Id", selectedTenantId)),
    );
  }

  const channels = yield* apiClient
    .get(new URL("/api/browser/channels", baseUrl))
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(ApertureBrowserChannelsResponse)));
  if (channels.channels.some((channel) => channel.name === "chromium") === false) {
    return yield* new ApertureChromiumUnavailableError({
      message: "The Aperture instance does not provide the Chromium browser channel.",
    });
  }

  const createSessionRequest = yield* HttpClientRequest.post(
    new URL("/api/sessions", baseUrl),
  ).pipe(
    HttpClientRequest.bodyJson({
      label: "t3code-gateway README screenshots",
      browser: {
        channel: "chromium",
        args: ["--force-device-scale-factor=2"],
      },
      tags: {
        purpose: "readme-screenshots",
      },
    }),
  );

  return yield* Effect.acquireUseRelease(
    apiClient
      .execute(createSessionRequest)
      .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(ApertureCreateSessionResponse))),
    (session) =>
      Effect.gen(function* () {
        const discoveryUrl = new URL(
          `${session.cdpUrl.pathname}/${encodeURIComponent(session.sessionToken)}/json/version`,
          session.cdpUrl,
        );
        const discovery = yield* httpClient.get(discoveryUrl).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(ApertureCdpDiscoveryResponse)),
          Effect.retry({
            schedule: Schedule.spaced("250 millis"),
            times: 120,
            while: (error) =>
              HttpClientError.isHttpClientError(error) &&
              error.reason instanceof HttpClientError.StatusCodeError &&
              (error.reason.response.status === 404 || error.reason.response.status === 502),
          }),
        );

        return yield* captureScreenshots({
          browser: {
            kind: "cdp",
            cdpUrl: discovery.webSocketDebuggerUrl.href,
          },
          distDirectory,
          output,
        }).pipe(Effect.scoped);
      }),
    (session) =>
      apiClient.del(new URL(`/api/sessions/${session.session.id}`, baseUrl)).pipe(Effect.orDie),
  );
});
