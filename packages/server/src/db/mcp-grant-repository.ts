import { and, eq, gt, isNull, lte, notExists, or } from "drizzle-orm";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { SqlError } from "effect/unstable/sql/SqlError";

import { GatewayDatabase } from "./database.ts";
import { DatabaseError, queryError } from "./errors.ts";
import { mcpGrants, mcpTokens } from "./schema.ts";

export type McpGrantRow = typeof mcpGrants.$inferSelect;
export type CreateMcpGrantInput = typeof mcpGrants.$inferInsert;
export type CreateMcpTokenInput = typeof mcpTokens.$inferInsert;

export class McpGrantRepository extends Context.Service<
  McpGrantRepository,
  {
    readonly listGrants: Effect.Effect<ReadonlyArray<McpGrantRow>, DatabaseError>;
    readonly findGrant: (grantId: string) => Effect.Effect<McpGrantRow | undefined, DatabaseError>;
    readonly createGrant: (
      grant: CreateMcpGrantInput,
      tokens: ReadonlyArray<CreateMcpTokenInput>,
    ) => Effect.Effect<void, DatabaseError>;
    /** The grant a refresh token belongs to, when neither has expired. */
    readonly findGrantByRefreshTokenHash: (
      tokenHash: string,
      now: string,
    ) => Effect.Effect<McpGrantRow | undefined, DatabaseError>;
    /** Swaps a used refresh token for new tokens; `false` when it was already used. */
    readonly rotateTokens: (
      usedTokenHash: string,
      tokens: ReadonlyArray<CreateMcpTokenInput>,
    ) => Effect.Effect<boolean, DatabaseError>;
    readonly addToken: (token: CreateMcpTokenInput) => Effect.Effect<void, DatabaseError>;
    readonly deleteToken: (tokenHash: string) => Effect.Effect<void, DatabaseError>;
    readonly deleteGrant: (grantId: string) => Effect.Effect<boolean, DatabaseError>;
    /** The grant an access token hash belongs to, when neither has expired. */
    readonly findGrantByTokenHash: (
      tokenHash: string,
      now: string,
    ) => Effect.Effect<McpGrantRow | undefined, DatabaseError>;
    readonly touchGrant: (grantId: string, usedAt: string) => Effect.Effect<void, DatabaseError>;
    readonly deleteExpired: (now: string) => Effect.Effect<void, DatabaseError>;
  }
>()("@t3code-gateway/server/db/mcp-grant-repository/McpGrantRepository") {}

const catchQuery = <A, R>(effect: Effect.Effect<A, EffectDrizzleQueryError | SqlError, R>) =>
  effect.pipe(
    Effect.catchTags({
      EffectDrizzleQueryError: (error) => queryError("mcpGrant", error),
      SqlError: (error) =>
        Effect.fail(new DatabaseError({ operation: "mcpGrant", reason: "query", cause: error })),
    }),
  );

const notExpired = (column: typeof mcpGrants.expiresAt | typeof mcpTokens.expiresAt, now: string) =>
  or(isNull(column), gt(column, now));

export const make = Effect.gen(function* () {
  const { db } = yield* GatewayDatabase;
  const listGrants = catchQuery(db.select().from(mcpGrants).all());

  const findGrant = (grantId: string) =>
    catchQuery(db.select().from(mcpGrants).where(eq(mcpGrants.grantId, grantId)).get());

  const createGrant = (grant: CreateMcpGrantInput, tokens: ReadonlyArray<CreateMcpTokenInput>) =>
    catchQuery(
      db.transaction((tx) =>
        Effect.gen(function* () {
          yield* tx.insert(mcpGrants).values(grant).run();
          yield* tx
            .insert(mcpTokens)
            .values([...tokens])
            .run();
        }),
      ),
    );

  const findGrantByRefreshTokenHash = (tokenHash: string, now: string) =>
    catchQuery(
      db
        .select({ grant: mcpGrants })
        .from(mcpTokens)
        .innerJoin(mcpGrants, eq(mcpGrants.grantId, mcpTokens.grantId))
        .where(
          and(
            eq(mcpTokens.tokenHash, tokenHash),
            eq(mcpTokens.kind, "refresh"),
            notExpired(mcpTokens.expiresAt, now),
            notExpired(mcpGrants.expiresAt, now),
          ),
        )
        .get()
        .pipe(Effect.map((row) => row?.grant)),
    );

  const rotateTokens = (usedTokenHash: string, tokens: ReadonlyArray<CreateMcpTokenInput>) =>
    catchQuery(
      db.transaction((tx) =>
        Effect.gen(function* () {
          const used = yield* tx
            .delete(mcpTokens)
            .where(and(eq(mcpTokens.tokenHash, usedTokenHash), eq(mcpTokens.kind, "refresh")))
            .run();
          if (used.changes === 0) {
            return false;
          }
          yield* tx
            .insert(mcpTokens)
            .values([...tokens])
            .run();
          return true;
        }),
      ),
    );

  const addToken = (token: CreateMcpTokenInput) =>
    catchQuery(db.insert(mcpTokens).values(token).run().pipe(Effect.asVoid));

  const deleteToken = (tokenHash: string) =>
    catchQuery(
      db.delete(mcpTokens).where(eq(mcpTokens.tokenHash, tokenHash)).run().pipe(Effect.asVoid),
    );

  const deleteGrant = (grantId: string) =>
    catchQuery(
      db
        .delete(mcpGrants)
        .where(eq(mcpGrants.grantId, grantId))
        .run()
        .pipe(Effect.map((result) => result.changes > 0)),
    );

  const findGrantByTokenHash = (tokenHash: string, now: string) =>
    catchQuery(
      db
        .select({ grant: mcpGrants })
        .from(mcpTokens)
        .innerJoin(mcpGrants, eq(mcpGrants.grantId, mcpTokens.grantId))
        .where(
          and(
            eq(mcpTokens.tokenHash, tokenHash),
            eq(mcpTokens.kind, "access"),
            notExpired(mcpTokens.expiresAt, now),
            notExpired(mcpGrants.expiresAt, now),
          ),
        )
        .get()
        .pipe(Effect.map((row) => row?.grant)),
    );

  const touchGrant = (grantId: string, usedAt: string) =>
    catchQuery(
      db
        .update(mcpGrants)
        .set({ lastUsedAt: usedAt })
        .where(eq(mcpGrants.grantId, grantId))
        .run()
        .pipe(Effect.asVoid),
    );

  const deleteExpired = (now: string) =>
    catchQuery(
      Effect.gen(function* () {
        yield* db.delete(mcpTokens).where(lte(mcpTokens.expiresAt, now)).run();
        yield* db.delete(mcpGrants).where(lte(mcpGrants.expiresAt, now)).run();
        // A grant without tokens (lapsed refresh token, or revoked through /oauth/revoke) can never be used again.
        yield* db
          .delete(mcpGrants)
          .where(
            notExists(db.select().from(mcpTokens).where(eq(mcpTokens.grantId, mcpGrants.grantId))),
          )
          .run();
      }),
    );

  return McpGrantRepository.of({
    listGrants,
    findGrant,
    createGrant,
    findGrantByRefreshTokenHash,
    rotateTokens,
    addToken,
    deleteToken,
    deleteGrant,
    findGrantByTokenHash,
    touchGrant,
    deleteExpired,
  });
});

export const layer = Layer.effect(McpGrantRepository, make);
