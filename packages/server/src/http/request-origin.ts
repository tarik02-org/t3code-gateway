import * as Option from "effect/Option";
import type * as Headers from "effect/unstable/http/Headers";

/**
 * The origin the client reached: `T3_GATEWAY_PUBLIC_URL` when set, otherwise
 * what the reverse proxy in front of the gateway reports.
 */
export const requestOrigin = (headers: Headers.Headers, publicUrl: Option.Option<URL>) => {
  if (Option.isSome(publicUrl)) {
    return publicUrl.value.origin;
  }
  const proto = headers["x-forwarded-proto"]?.split(",")[0]?.trim() ?? "http";
  const host = headers["x-forwarded-host"]?.split(",")[0]?.trim() ?? headers["host"];
  return `${proto}://${host ?? "localhost"}`;
};
