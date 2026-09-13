import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { GatewayRuntimeConfig } from "../config.ts";
import { T3CodeWebService } from "../t3code-web/service.ts";
import { GATEWAY_VERSION } from "../version.ts";

export const buildGatewayStatus = Effect.fn("buildGatewayStatus")(function* () {
  const config = yield* GatewayRuntimeConfig;
  const t3codeWeb = yield* T3CodeWebService;

  return {
    ok: true,
    version: GATEWAY_VERSION,
    database: {
      migrated: true,
    },
    t3codeWeb:
      config.t3codeWebEnabled === true && Option.isSome(config.t3codeWebStaticRoot)
        ? yield* t3codeWeb.status
        : {
            available: false,
            channel: "nightly" as const,
            autoUpdate: false,
            channels: {
              stable: { installedVersion: null },
              nightly: { installedVersion: null },
            },
          },
  };
});
