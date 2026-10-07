import type * as Headers from "effect/unstable/http/Headers";

/** The origin the client reached, as the reverse proxy in front of the gateway reports it. */
export const requestOrigin = (headers: Headers.Headers) => {
  const proto = headers["x-forwarded-proto"]?.split(",")[0]?.trim() ?? "http";
  const host = headers["x-forwarded-host"]?.split(",")[0]?.trim() ?? headers["host"];
  return `${proto}://${host ?? "localhost"}`;
};
