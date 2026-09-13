import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  ChangePasswordRequest,
  CurrentUser,
  GatewayStatus,
  LoginRequest,
  LoginResponse,
} from "@t3code-gateway/contracts/schemas";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { AuthService } from "../auth/service.ts";
import { SESSION_COOKIE_NAME } from "../auth/constants.ts";
import { readSessionToken, sessionCookieOptions } from "./cookies.ts";
import { buildGatewayStatus } from "./status.ts";

const isSecureRequest = (request: HttpServerRequest.HttpServerRequest) =>
  request.originalUrl.startsWith("https://") || request.headers["x-forwarded-proto"] === "https";

const authFailure = (message: string) =>
  HttpServerResponse.json({ error: message }).pipe(
    Effect.map((response) => HttpServerResponse.setStatus(response, 401)),
  );

const internalFailure = (message: string) =>
  HttpServerResponse.json({ error: message }).pipe(
    Effect.map((response) => HttpServerResponse.setStatus(response, 500)),
  );

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const auth = yield* AuthService;

    yield* router.add("POST", "/api/gateway/auth/login", (request) =>
      Effect.gen(function* () {
        const payload = yield* HttpServerRequest.schemaBodyJson(LoginRequest).pipe(Effect.orDie);
        const result = yield* auth.login(payload.username, payload.password);
        const response = yield* HttpServerResponse.json({
          user: result.user,
        } satisfies LoginResponse);
        return HttpServerResponse.setCookieUnsafe(
          response,
          SESSION_COOKIE_NAME,
          result.sessionToken,
          sessionCookieOptions(isSecureRequest(request)),
        );
      }).pipe(
        Effect.catchTags({
          AuthFailure: (error) => authFailure(error.message),
          DatabaseError: (error) => internalFailure(error.message),
        }),
      ),
    );

    yield* router.add("POST", "/api/gateway/auth/logout", (request) =>
      Effect.gen(function* () {
        yield* auth.logout(readSessionToken(request.cookies));
        const response = HttpServerResponse.empty({ status: 204 });
        return HttpServerResponse.expireCookieUnsafe(response, SESSION_COOKIE_NAME, {
          path: "/",
          secure: isSecureRequest(request),
        });
      }).pipe(
        Effect.catchTags({
          DatabaseError: (error) => internalFailure(error.message),
        }),
      ),
    );

    yield* router.add("GET", "/api/gateway/auth/me", (request) =>
      Effect.gen(function* () {
        const user = yield* auth.currentUser(readSessionToken(request.cookies));
        return yield* HttpServerResponse.json(user satisfies CurrentUser | null);
      }).pipe(
        Effect.catchTags({
          DatabaseError: (error) => internalFailure(error.message),
        }),
      ),
    );

    yield* router.add("POST", "/api/gateway/auth/change-password", (request) =>
      Effect.gen(function* () {
        const payload = yield* HttpServerRequest.schemaBodyJson(ChangePasswordRequest).pipe(
          Effect.orDie,
        );
        yield* auth.changePassword(
          readSessionToken(request.cookies),
          payload.currentPassword,
          payload.nextPassword,
        );
        return HttpServerResponse.empty({ status: 204 });
      }).pipe(
        Effect.catchTags({
          AuthFailure: (error) => authFailure(error.message),
          DatabaseError: (error) => internalFailure(error.message),
        }),
      ),
    );

    yield* router.add("GET", "/api/gateway/status", () =>
      Effect.gen(function* () {
        const status = yield* buildGatewayStatus().pipe(Effect.orDie);
        return yield* HttpServerResponse.json(status satisfies GatewayStatus);
      }),
    );
  }),
);
