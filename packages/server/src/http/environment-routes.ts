import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  CreateEnvironmentPairingLinkRequest,
  EnvironmentInput,
  EnvironmentRecord,
  EnvironmentClientSession,
  EnvironmentPairingLink,
  RevokeEnvironmentClientResponse,
  T3CodeCatalogEntryRequest,
  T3CodeCatalogEntryResponse,
  UpdateEnvironmentRequest,
  ValidateEnvironmentResponse,
} from "@t3code-gateway/contracts/schemas";
import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { DatabaseError } from "../db/errors.ts";
import { EnvironmentService } from "../environments/service.ts";
import { TraefikReconciler } from "../traefik/reconciler.ts";

const jsonError = (message: string, status: number) =>
  HttpServerResponse.json({ error: message }).pipe(
    Effect.orDie,
    Effect.map((response) => HttpServerResponse.setStatus(response, status)),
  );

const environmentRouteErrors = {
  EnvironmentFailure: (error: EnvironmentFailure) => jsonError(error.message, error.status ?? 400),
  DatabaseError: (error: DatabaseError) => jsonError(error.message, 500),
};

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const environments = yield* EnvironmentService;
    const traefik = yield* TraefikReconciler;

    yield* router.add("GET", "/api/gateway/environments", () =>
      Effect.gen(function* () {
        const items = yield* environments.list();
        return yield* HttpServerResponse.json(
          items satisfies ReadonlyArray<EnvironmentRecord>,
        ).pipe(Effect.orDie);
      }).pipe(
        Effect.catchTags({
          DatabaseError: (error) => jsonError(error.message, 500),
        }),
      ),
    );

    yield* router.add("POST", "/api/gateway/environments/validate", () =>
      Effect.gen(function* () {
        const payload = yield* HttpServerRequest.schemaBodyJson(EnvironmentInput).pipe(
          Effect.orDie,
        );
        const result = yield* environments.validate(payload);
        return yield* HttpServerResponse.json(result satisfies ValidateEnvironmentResponse).pipe(
          Effect.orDie,
        );
      }).pipe(Effect.catchTags(environmentRouteErrors)),
    );

    yield* router.add("POST", "/api/gateway/environments/:environmentId/validate", () =>
      Effect.gen(function* () {
        const params = yield* HttpRouter.params;
        const environmentId = params.environmentId;
        if (environmentId === undefined || environmentId.length === 0) {
          return yield* jsonError("Environment ID is required", 400);
        }

        const payload = yield* HttpServerRequest.schemaBodyJson(EnvironmentInput).pipe(
          Effect.orDie,
        );
        const result = yield* environments.validateForEdit(environmentId, payload);
        return yield* HttpServerResponse.json(result satisfies ValidateEnvironmentResponse).pipe(
          Effect.orDie,
        );
      }).pipe(Effect.catchTags(environmentRouteErrors)),
    );

    yield* router.add("POST", "/api/gateway/environments", () =>
      Effect.gen(function* () {
        const payload = yield* HttpServerRequest.schemaBodyJson(EnvironmentInput).pipe(
          Effect.orDie,
        );
        const created = yield* environments.create(payload);
        yield* traefik.reconcile();
        const response = yield* HttpServerResponse.json(created satisfies EnvironmentRecord).pipe(
          Effect.orDie,
        );
        return HttpServerResponse.setStatus(response, 201);
      }).pipe(Effect.catchTags(environmentRouteErrors)),
    );

    yield* router.add("GET", "/api/gateway/environments/:environmentId", () =>
      Effect.gen(function* () {
        const params = yield* HttpRouter.params;
        const environmentId = params.environmentId;
        if (environmentId === undefined || environmentId.length === 0) {
          return yield* jsonError("Environment ID is required", 400);
        }

        const record = yield* environments.get(environmentId);
        return yield* HttpServerResponse.json(record satisfies EnvironmentRecord).pipe(
          Effect.orDie,
        );
      }).pipe(Effect.catchTags(environmentRouteErrors)),
    );

    yield* router.add("PATCH", "/api/gateway/environments/:environmentId", () =>
      Effect.gen(function* () {
        const params = yield* HttpRouter.params;
        const environmentId = params.environmentId;
        if (environmentId === undefined || environmentId.length === 0) {
          return yield* jsonError("Environment ID is required", 400);
        }

        const payload = yield* HttpServerRequest.schemaBodyJson(UpdateEnvironmentRequest).pipe(
          Effect.orDie,
        );
        const updated = yield* environments.update(environmentId, payload);
        yield* traefik.reconcile();
        return yield* HttpServerResponse.json(updated satisfies EnvironmentRecord).pipe(
          Effect.orDie,
        );
      }).pipe(Effect.catchTags(environmentRouteErrors)),
    );

    yield* router.add("DELETE", "/api/gateway/environments/:environmentId", () =>
      Effect.gen(function* () {
        const params = yield* HttpRouter.params;
        const environmentId = params.environmentId;
        if (environmentId === undefined || environmentId.length === 0) {
          return yield* jsonError("Environment ID is required", 400);
        }

        yield* environments.remove(environmentId);
        yield* traefik.reconcile();
        return HttpServerResponse.empty({ status: 204 });
      }).pipe(Effect.catchTags(environmentRouteErrors)),
    );

    yield* router.add("GET", "/api/gateway/environments/:environmentId/clients", () =>
      Effect.gen(function* () {
        const params = yield* HttpRouter.params;
        const environmentId = params.environmentId;
        if (environmentId === undefined || environmentId.length === 0) {
          return yield* jsonError("Environment ID is required", 400);
        }

        const clients = yield* environments.listClients(environmentId);
        return yield* HttpServerResponse.json(
          clients satisfies ReadonlyArray<EnvironmentClientSession>,
        ).pipe(Effect.orDie);
      }).pipe(Effect.catchTags(environmentRouteErrors)),
    );

    yield* router.add("POST", "/api/gateway/environments/:environmentId/pairing-link", () =>
      Effect.gen(function* () {
        const params = yield* HttpRouter.params;
        const environmentId = params.environmentId;
        if (environmentId === undefined || environmentId.length === 0) {
          return yield* jsonError("Environment ID is required", 400);
        }

        const payload = yield* HttpServerRequest.schemaBodyJson(
          CreateEnvironmentPairingLinkRequest,
        ).pipe(Effect.orDie);
        const result = yield* environments.createPairingLink(environmentId, payload);
        return yield* HttpServerResponse.json(result satisfies EnvironmentPairingLink).pipe(
          Effect.orDie,
        );
      }).pipe(Effect.catchTags(environmentRouteErrors)),
    );

    yield* router.add("POST", "/api/gateway/environments/:environmentId/t3code-catalog-entry", () =>
      Effect.gen(function* () {
        const params = yield* HttpRouter.params;
        const environmentId = params.environmentId;
        if (environmentId === undefined || environmentId.length === 0) {
          return yield* jsonError("Environment ID is required", 400);
        }

        const payload = yield* HttpServerRequest.schemaBodyJson(T3CodeCatalogEntryRequest).pipe(
          Effect.orDie,
        );
        const result = yield* environments.createT3CodeCatalogEntry(environmentId, payload);
        return yield* HttpServerResponse.json(result satisfies T3CodeCatalogEntryResponse).pipe(
          Effect.orDie,
        );
      }).pipe(Effect.catchTags(environmentRouteErrors)),
    );

    yield* router.add(
      "POST",
      "/api/gateway/environments/:environmentId/clients/:sessionId/revoke",
      () =>
        Effect.gen(function* () {
          const params = yield* HttpRouter.params;
          const environmentId = params.environmentId;
          const sessionId = params.sessionId;
          if (environmentId === undefined || environmentId.length === 0) {
            return yield* jsonError("Environment ID is required", 400);
          }
          if (sessionId === undefined || sessionId.length === 0) {
            return yield* jsonError("Client session ID is required", 400);
          }

          const result = yield* environments.revokeClient(environmentId, sessionId);
          return yield* HttpServerResponse.json(
            result satisfies RevokeEnvironmentClientResponse,
          ).pipe(Effect.orDie);
        }).pipe(Effect.catchTags(environmentRouteErrors)),
    );
  }),
);
