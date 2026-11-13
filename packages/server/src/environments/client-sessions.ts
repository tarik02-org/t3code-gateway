import type { EnvironmentClientSession } from "@t3code-gateway/contracts/schemas";
import {
  EnvironmentClientSession as EnvironmentClientSessionSchema,
  EnvironmentFailure,
} from "@t3code-gateway/contracts/schemas";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FiberMap from "effect/FiberMap";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/http/HttpClient";
import * as Socket from "effect/socket/Socket";
import { makeT3CodeClient } from "t3code-cli/connection";
import {
  type AuthAccessStreamEvent,
  type AuthClientSession,
  WS_METHODS,
} from "t3code-cli/contracts";

import { EnvironmentClientSessionRepository } from "../db/environment-client-session-repository.ts";
import { EnvironmentRepository, type EnvironmentRow } from "../db/environment-repository.ts";
import { DatabaseError } from "../db/errors.ts";
import { AdminTokenRotation } from "./admin-token-rotation.ts";
import { CLIENT_SESSIONS_RECONCILE_INTERVAL, CLIENT_SESSIONS_RETRY_INTERVAL } from "./constants.ts";

const ClientSessionsFromJson = Schema.fromJsonString(Schema.Array(EnvironmentClientSessionSchema));
const encodeClientSessions = Schema.encodeSync(ClientSessionsFromJson);
const decodeClientSessions = Schema.decodeUnknownOption(ClientSessionsFromJson);

const toClientSession = (session: AuthClientSession): EnvironmentClientSession => ({
  sessionId: session.sessionId,
  subject: session.subject,
  // `scopes` lists only the scopes older clients know; `permissions` is the whole grant.
  scopes: session.permissions ?? session.scopes,
  method: session.method,
  client: session.client,
  issuedAt: DateTime.formatIso(session.issuedAt),
  expiresAt: DateTime.formatIso(session.expiresAt),
  lastConnectedAt:
    session.lastConnectedAt === null ? null : DateTime.formatIso(session.lastConnectedAt),
  connected: session.connected,
  current: session.current,
});

/**
 * Keeps one auth-access subscription open per enabled environment and caches the client
 * sessions it reports, since T3 Code only publishes them over its WebSocket.
 */
export class EnvironmentClientSessions extends Context.Service<
  EnvironmentClientSessions,
  {
    /** The sessions the environment last reported; `current` marks the gateway's admin token. */
    readonly list: (
      environmentId: string,
    ) => Effect.Effect<ReadonlyArray<EnvironmentClientSession>, EnvironmentFailure | DatabaseError>;
    /** Starts, restarts, or stops subscriptions to match the enabled environments. */
    readonly reconcile: Effect.Effect<void>;
    /** Reconnects one environment, for example after its admin token was replaced. */
    readonly restart: (environmentId: string) => Effect.Effect<void>;
    /** Reconciles now and then periodically, for the lifetime of the calling scope. */
    readonly run: Effect.Effect<void, never, Scope.Scope>;
  }
>()("@t3code-gateway/server/environments/client-sessions/EnvironmentClientSessions") {}

export const make = Effect.gen(function* () {
  const environments = yield* EnvironmentRepository;
  const cache = yield* EnvironmentClientSessionRepository;
  const adminTokens = yield* AdminTokenRotation;
  const httpClient = yield* HttpClient.HttpClient;
  const webSocketConstructor = yield* Socket.WebSocketConstructor;
  const watchers = yield* FiberMap.make<string>();
  const watchedEndpoints = new Map<string, string>();
  const lastFailures = new Map<string, string>();
  const reconcileLock = yield* Semaphore.make(1);

  const subscribe = (row: EnvironmentRow) =>
    Effect.gen(function* () {
      const adminToken = yield* adminTokens.ensureFresh(row.environmentId);
      if (adminToken.length === 0) {
        return yield* new EnvironmentFailure({ message: "Admin bearer token is required" });
      }

      const t3 = yield* makeT3CodeClient(
        Effect.succeed({ origin: { url: row.endpoint }, auth: { token: adminToken } }),
      );
      const ws = yield* t3.rpc.getClient;
      const sessions = new Map<string, EnvironmentClientSession>();

      const save = Effect.gen(function* () {
        yield* cache.save({
          environmentId: row.environmentId,
          sessionsJson: encodeClientSessions([...sessions.values()]),
          syncedAt: DateTime.formatIso(yield* DateTime.now),
        });
        lastFailures.delete(row.environmentId);
      });

      const apply = (event: AuthAccessStreamEvent) => {
        switch (event.type) {
          case "snapshot":
            sessions.clear();
            for (const session of event.payload.clientSessions) {
              sessions.set(session.sessionId, toClientSession(session));
            }
            return save;
          case "clientUpserted":
            sessions.set(event.payload.sessionId, toClientSession(event.payload));
            return save;
          case "clientRemoved":
            sessions.delete(event.payload.sessionId);
            return save;
          case "pairingLinkUpserted":
          case "pairingLinkRemoved":
            return Effect.void;
        }
      };

      yield* ws[WS_METHODS.subscribeAuthAccess]({}).pipe(Stream.runForEach(apply));
    }).pipe(
      Effect.scoped,
      Effect.provideService(HttpClient.HttpClient, httpClient),
      Effect.provideService(Socket.WebSocketConstructor, webSocketConstructor),
    );

  // Runs until the environment is removed, disabled, or moved; a dropped stream reconnects
  // with a freshly checked admin token.
  const watch = (row: EnvironmentRow) =>
    subscribe(row).pipe(
      Effect.andThen(
        Effect.logInfo("Environment client session stream ended").pipe(
          Effect.annotateLogs({ environmentId: row.environmentId }),
        ),
      ),
      Effect.catch((error) =>
        Effect.gen(function* () {
          lastFailures.set(row.environmentId, error.message);
          yield* Effect.logWarning("Environment client session stream failed").pipe(
            Effect.annotateLogs({ environmentId: row.environmentId, reason: error.message }),
          );
        }),
      ),
      Effect.andThen(Effect.sleep(CLIENT_SESSIONS_RETRY_INTERVAL)),
      Effect.forever,
    );

  const reconcile = reconcileLock
    .withPermit(
      Effect.gen(function* () {
        const rows = yield* environments.listEnvironments;
        const wanted = new Map(
          rows.filter((row) => row.enabled).map((row) => [row.environmentId, row] as const),
        );

        for (const [environmentId, endpoint] of watchedEndpoints) {
          if (wanted.get(environmentId)?.endpoint !== endpoint) {
            yield* FiberMap.remove(watchers, environmentId);
            watchedEndpoints.delete(environmentId);
            lastFailures.delete(environmentId);
          }
        }

        for (const row of wanted.values()) {
          if (!watchedEndpoints.has(row.environmentId)) {
            watchedEndpoints.set(row.environmentId, row.endpoint);
            yield* FiberMap.run(watchers, row.environmentId)(watch(row));
          }
        }
      }),
    )
    .pipe(
      Effect.catchTag("DatabaseError", (error) =>
        Effect.logError("Could not load environments for client session sync").pipe(
          Effect.annotateLogs({ reason: error.message }),
        ),
      ),
    );

  const run = reconcile.pipe(
    Effect.repeat(Schedule.spaced(CLIENT_SESSIONS_RECONCILE_INTERVAL)),
    Effect.forkScoped({ startImmediately: true }),
    Effect.asVoid,
  );

  const list = (environmentId: string) =>
    Effect.gen(function* () {
      const row = yield* cache.find(environmentId);
      const sessions = row === undefined ? undefined : decodeClientSessions(row.sessionsJson);
      if (sessions === undefined || Option.isNone(sessions)) {
        return yield* new EnvironmentFailure({
          message:
            lastFailures.get(environmentId) ?? "The environment has not reported its sessions yet",
          status: 503,
        });
      }
      return sessions.value;
    });

  const restart = (environmentId: string) =>
    reconcileLock
      .withPermit(
        Effect.gen(function* () {
          yield* FiberMap.remove(watchers, environmentId);
          watchedEndpoints.delete(environmentId);
        }),
      )
      .pipe(Effect.andThen(reconcile));

  return EnvironmentClientSessions.of({ list, reconcile, restart, run });
});

export const layer = Layer.effect(EnvironmentClientSessions, make);
