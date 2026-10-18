import { DatabaseSync, type SQLInputValue, type StatementResultingChanges } from "node:sqlite";

import { EffectCache, type EffectCacheShape } from "drizzle-orm/cache/core/cache-effect";
import { DefaultServices } from "drizzle-orm/effect-core/defaults";
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors";
import { EffectLogger, type EffectLoggerShape } from "drizzle-orm/effect-core/logger";
import type { QueryEffectHKTBase } from "drizzle-orm/effect-core/query-effect";
import { entityKind } from "drizzle-orm/entity";
import type { AnyRelations, EmptyRelations } from "drizzle-orm/relations";
import type { Query } from "drizzle-orm/sql/sql";
import { SQLiteDialect } from "drizzle-orm/sqlite-core/dialect";
import { SQLiteEffectDatabase } from "drizzle-orm/sqlite-core/effect/db";
import {
  SQLiteEffectPreparedQuery,
  SQLiteEffectSession,
  SQLiteEffectTransaction,
} from "drizzle-orm/sqlite-core/effect/session";
import type { EffectDrizzleSQLiteConfig } from "drizzle-orm/sqlite-core/effect/utils";
import type {
  PreparedQueryConfig,
  SQLiteExecuteMethod,
  SQLiteTransactionConfig,
} from "drizzle-orm/sqlite-core/session";
import * as Effect from "effect/Effect";
import * as SqlError from "effect/unstable/sql/SqlError";

export interface EffectNodeSqliteQueryEffectHKT extends QueryEffectHKTBase {
  readonly error: EffectDrizzleQueryError;
  readonly context: never;
}

export type EffectNodeSqliteRunResult = StatementResultingChanges;

const toSqlError = (cause: unknown, operation: string) =>
  new SqlError.SqlError({
    reason: SqlError.classifySqliteError(cause, { operation }),
  });

const asSqliteParams = (params: unknown[]): SQLInputValue[] => params as SQLInputValue[];

interface EffectNodeSqliteSessionOptions {
  readonly logger: EffectLoggerShape;
  readonly cache: EffectCacheShape;
}

class EffectNodeSqliteSession<TRelations extends AnyRelations> extends SQLiteEffectSession<
  EffectNodeSqliteRunResult,
  EffectNodeSqliteQueryEffectHKT,
  TRelations
> {
  static override readonly [entityKind] = "EffectNodeSqliteSession";

  private readonly client: DatabaseSync;
  protected readonly relations: TRelations;
  private readonly options: EffectNodeSqliteSessionOptions;

  constructor(
    client: DatabaseSync,
    dialect: SQLiteDialect,
    relations: TRelations,
    options: EffectNodeSqliteSessionOptions,
  ) {
    super(dialect);
    this.client = client;
    this.relations = relations;
    this.options = options;
  }

  executeRaw(command: string): Effect.Effect<EffectNodeSqliteRunResult, SqlError.SqlError> {
    return Effect.try({
      try: () => this.client.prepare(command).run(),
      catch: (cause) => toSqlError(cause, "execute"),
    });
  }

  override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
    query: Query,
    mode: "arrays" | "objects" | "raw",
    _prepare: boolean,
    executeMethod?: SQLiteExecuteMethod,
    mapper?: (rows: unknown[]) => unknown,
    queryMetadata?: {
      type: "select" | "update" | "delete" | "insert";
      tables: string[];
    },
  ): SQLiteEffectPreparedQuery<T, EffectNodeSqliteQueryEffectHKT> {
    const statement = Effect.try({
      try: () => this.client.prepare(query.sql),
      catch: (cause) => toSqlError(cause, "prepare"),
    });

    return new SQLiteEffectPreparedQuery<T, EffectNodeSqliteQueryEffectHKT>(
      executeMethod,
      {
        all: (params) =>
          statement.pipe(
            Effect.map((stmt) => {
              stmt.setReturnArrays(mode === "arrays");
              const rows = stmt.all(...asSqliteParams(params));
              if (mode === "objects") {
                return rows.map((row) => ({ ...row }));
              }
              return rows;
            }),
          ),
        get: (params) =>
          statement.pipe(
            Effect.map((stmt) => {
              stmt.setReturnArrays(mode === "arrays");
              const row = stmt.get(...asSqliteParams(params));
              if (row !== undefined && mode === "objects") {
                return { ...row };
              }
              return row;
            }),
          ),
        values: (params) =>
          statement.pipe(
            Effect.map((stmt) => {
              stmt.setReturnArrays(true);
              return stmt.all(...asSqliteParams(params));
            }),
          ),
        run: (params) =>
          statement.pipe(
            Effect.map((stmt) => {
              stmt.setReturnArrays(false);
              return stmt.run(...asSqliteParams(params));
            }),
          ),
      },
      query,
      mapper,
      mode,
      this.options.logger,
      this.options.cache,
      queryMetadata,
      undefined,
    );
  }

  override transaction<A, E, R>(
    transaction: (
      tx: SQLiteEffectTransaction<
        EffectNodeSqliteQueryEffectHKT,
        EffectNodeSqliteRunResult,
        TRelations
      >,
    ) => Effect.Effect<A, E, R>,
    config: SQLiteTransactionConfig = {},
  ): Effect.Effect<A, E | SqlError.SqlError, R> {
    const tx = new EffectNodeSqliteTransaction(this.dialect, this, this.relations);
    const begin = `begin${config.behavior ? ` ${config.behavior}` : ""}`;

    return this.executeRaw(begin).pipe(
      Effect.flatMap(() =>
        transaction(tx).pipe(
          Effect.tap(() => this.executeRaw("commit")),
          Effect.catch((cause) =>
            this.executeRaw("rollback").pipe(Effect.flatMap(() => Effect.fail(cause))),
          ),
        ),
      ),
    );
  }
}

class EffectNodeSqliteTransaction<TRelations extends AnyRelations> extends SQLiteEffectTransaction<
  EffectNodeSqliteQueryEffectHKT,
  EffectNodeSqliteRunResult,
  TRelations
> {
  static override readonly [entityKind] = "EffectNodeSqliteTransaction";

  private readonly session: EffectNodeSqliteSession<TRelations>;

  constructor(
    dialect: SQLiteDialect,
    session: EffectNodeSqliteSession<TRelations>,
    relations: TRelations,
    nestedIndex = 0,
  ) {
    super(dialect, session, relations, nestedIndex);
    this.session = session;
  }

  override transaction<A, E, R>(
    transaction: (
      tx: SQLiteEffectTransaction<
        EffectNodeSqliteQueryEffectHKT,
        EffectNodeSqliteRunResult,
        TRelations
      >,
    ) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | SqlError.SqlError, R> {
    const savepointName = `sp${this.nestedIndex + 1}`;
    const tx = new EffectNodeSqliteTransaction(
      this.session.dialect,
      this.session,
      this._.relations,
      this.nestedIndex + 1,
    );

    return this.session.executeRaw(`savepoint ${savepointName}`).pipe(
      Effect.flatMap(() =>
        transaction(tx).pipe(
          Effect.tap(() => this.session.executeRaw(`release savepoint ${savepointName}`)),
          Effect.catch((cause) =>
            this.session
              .executeRaw(`rollback to savepoint ${savepointName}`)
              .pipe(Effect.flatMap(() => Effect.fail(cause))),
          ),
        ),
      ),
    );
  }
}

export class EffectNodeSqliteDatabase<
  TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteEffectDatabase<
  EffectNodeSqliteQueryEffectHKT,
  EffectNodeSqliteRunResult,
  TRelations
> {
  static override readonly [entityKind] = "EffectNodeSqliteDatabase";
}

export const make = <TRelations extends AnyRelations = EmptyRelations>(
  client: DatabaseSync,
  config: EffectDrizzleSQLiteConfig<TRelations> = {},
) =>
  Effect.gen(function* () {
    const cache = yield* EffectCache;
    const logger = yield* EffectLogger;
    const dialect = new SQLiteDialect({ useJitMappers: config.jit === true });
    const relations = config.relations ?? ({} as TRelations);
    const session = new EffectNodeSqliteSession(client, dialect, relations, { logger, cache });
    const db = new EffectNodeSqliteDatabase(
      dialect,
      session,
      relations,
    ) as EffectNodeSqliteDatabase<TRelations> & {
      $client: DatabaseSync;
    };

    db.$client = client;
    db.$cache = { invalidate: cache.onMutate };

    return db;
  });

export const makeWithDefaults = <TRelations extends AnyRelations = EmptyRelations>(
  client: DatabaseSync,
  config: EffectDrizzleSQLiteConfig<TRelations> = {},
) => make(client, config).pipe(Effect.provide(DefaultServices));
