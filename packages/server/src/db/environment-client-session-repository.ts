import { eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { GatewayDatabase } from "./database.ts";
import { DatabaseError, queryError } from "./errors.ts";
import { environmentClientSessions } from "./schema.ts";

export interface EnvironmentClientSessionsRow {
  readonly environmentId: string;
  readonly sessionsJson: string;
  readonly syncedAt: string;
}

export class EnvironmentClientSessionRepository extends Context.Service<
  EnvironmentClientSessionRepository,
  {
    readonly find: (
      environmentId: string,
    ) => Effect.Effect<EnvironmentClientSessionsRow | undefined, DatabaseError>;
    readonly save: (row: EnvironmentClientSessionsRow) => Effect.Effect<void, DatabaseError>;
  }
>()(
  "@t3code-gateway/server/db/environment-client-session-repository/EnvironmentClientSessionRepository",
) {}

export const make = Effect.gen(function* () {
  const { db } = yield* GatewayDatabase;

  const find = (environmentId: string) =>
    db
      .select()
      .from(environmentClientSessions)
      .where(eq(environmentClientSessions.environmentId, environmentId))
      .get()
      .pipe(
        Effect.catchTags({
          EffectDrizzleQueryError: (error) => queryError("environmentClientSessions", error),
        }),
      );

  const save = (row: EnvironmentClientSessionsRow) =>
    db
      .insert(environmentClientSessions)
      .values(row)
      .onConflictDoUpdate({
        target: environmentClientSessions.environmentId,
        set: { sessionsJson: row.sessionsJson, syncedAt: row.syncedAt },
      })
      .run()
      .pipe(
        Effect.asVoid,
        Effect.catchTags({
          EffectDrizzleQueryError: (error) => queryError("environmentClientSessions", error),
        }),
      );

  return EnvironmentClientSessionRepository.of({ find, save });
});

export const layer = Layer.effect(EnvironmentClientSessionRepository, make);
