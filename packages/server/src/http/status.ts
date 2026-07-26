import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { GatewayRuntimeConfig } from "../config.ts";
import { GATEWAY_VERSION } from "../version.ts";

export const buildGatewayStatus = Effect.gen(function* () {
  const config = yield* GatewayRuntimeConfig;

  return {
    ok: true,
    version: GATEWAY_VERSION,
    database: {
      migrated: true,
    },
    t3codeWeb: {
      available: config.t3codeWebEnabled === true && Option.isSome(config.t3codeWebStaticRoot),
      buildId: Option.getOrUndefined(config.t3codeWebBuildId),
    },
  };
});
