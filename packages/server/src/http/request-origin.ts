import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";

/** The origin the client reached, as the reverse proxy in front of the gateway reports it. */
export const requestOrigin = (request: HttpServerRequest.HttpServerRequest) => {
  const proto = request.headers["x-forwarded-proto"]?.split(",")[0]?.trim() ?? "http";
  const host =
    request.headers["x-forwarded-host"]?.split(",")[0]?.trim() ?? request.headers["host"];
  return `${proto}://${host ?? "localhost"}`;
};
