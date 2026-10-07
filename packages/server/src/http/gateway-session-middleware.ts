import {
  GatewayRequestContext,
  GatewaySessionMiddleware,
} from "@t3code-gateway/contracts/gateway-session";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Cookies from "effect/unstable/http/Cookies";
import * as Headers from "effect/unstable/http/Headers";

import { SESSION_COOKIE_NAME } from "../auth/constants.ts";
import { requestOrigin } from "./request-origin.ts";

const readSessionToken = (cookies: Readonly<Record<string, string>>) =>
  cookies[SESSION_COOKIE_NAME];

const isSecureFromHeaders = (headers: Headers.Headers) =>
  Headers.get(headers, "x-forwarded-proto").pipe(
    Option.map((value) => value === "https"),
    Option.getOrElse(() => false),
  );

const requestContextFromHeaders = (headers: Headers.Headers) => {
  const cookieHeader = Headers.get(headers, "cookie").pipe(Option.getOrUndefined);
  const cookies = Cookies.parseHeader(cookieHeader ?? "");

  return {
    sessionToken: readSessionToken(cookies),
    secure: isSecureFromHeaders(headers),
    origin: requestOrigin(headers),
  };
};

export const layer = Layer.succeed(GatewaySessionMiddleware, (effect, { headers }) =>
  Effect.provideService(effect, GatewayRequestContext, requestContextFromHeaders(headers)),
);
