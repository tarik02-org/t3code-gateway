import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { AuthService } from "../auth/service.ts";
import { GatewayRuntimeConfig } from "../config.ts";
import { readSessionToken } from "./cookies.ts";

const publicGatewayRoutes = new Set([
  "POST /api/gateway/auth/login",
  "POST /api/gateway/auth/logout",
  "GET /api/gateway/auth/me",
]);

const pathname = (url: string) => new URL(url, "http://gateway.local").pathname;

const publicT3CodeAssetPaths = new Set([
  "/favicon.ico",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/robots.txt",
  "/site.webmanifest",
]);

const lastPathSegment = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const isT3CodeAssetPath = (path: string) =>
  path.startsWith("/assets/") ||
  publicT3CodeAssetPaths.has(path) ||
  (path !== "/index.html" && lastPathSegment(path).includes("."));

const sessionRequiredFor = (
  request: HttpServerRequest.HttpServerRequest,
  t3codeWebAvailable: boolean,
) => {
  const path = pathname(request.url);

  if (publicGatewayRoutes.has(`${request.method} ${path}`)) {
    return false;
  }

  if (path.startsWith("/api/gateway/")) {
    return true;
  }

  if (path === "/admin/login" || path.startsWith("/admin/login/")) {
    return false;
  }

  if (
    path.startsWith("/admin/assets/") ||
    path === "/admin/favicon.svg" ||
    path === "/admin/site.webmanifest"
  ) {
    return false;
  }

  if (path === "/admin" || path.startsWith("/admin/")) {
    return true;
  }

  if (path === "/" && t3codeWebAvailable === false) {
    return false;
  }

  return !isT3CodeAssetPath(path);
};

const unauthenticatedResponse = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<HttpServerResponse.HttpServerResponse> => {
  const path = pathname(request.url);

  if (path === "/admin" || path.startsWith("/admin/") || !path.startsWith("/api/")) {
    return Effect.succeed(HttpServerResponse.redirect("/admin/login", { status: 302 }));
  }

  return Effect.succeed(
    HttpServerResponse.jsonUnsafe({ error: "Authentication required" }, { status: 401 }),
  );
};

export const sessionGuard = <E, R>(
  handler: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    E,
    HttpServerRequest.HttpServerRequest | R
  >,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  E,
  HttpServerRequest.HttpServerRequest | AuthService | GatewayRuntimeConfig | R
> =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* GatewayRuntimeConfig;
    const t3codeWebAvailable =
      config.t3codeWebEnabled === true && Option.isSome(config.t3codeWebStaticRoot);

    if (!sessionRequiredFor(request, t3codeWebAvailable)) {
      return yield* handler;
    }

    const auth = yield* AuthService;
    const user = yield* auth.currentUser(readSessionToken(request.cookies)).pipe(Effect.orDie);
    if (user !== null) {
      return yield* handler;
    }

    return yield* unauthenticatedResponse(request);
  });
