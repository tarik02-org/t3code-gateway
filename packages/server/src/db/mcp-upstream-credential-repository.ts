import type { McpAccess } from "@t3code-gateway/contracts/schemas";
import { and, eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { GatewayDatabase } from "./database.ts";
import { DatabaseError, queryError } from "./errors.ts";
import { mcpUpstreamCredentials } from "./schema.ts";

export interface McpUpstreamCredentialRow {
  readonly environmentId: string;
  readonly access: McpAccess;
  readonly tokenEncrypted: Buffer | null;
  readonly sessionId: string | null;
  readonly expiresAt: string | null;
  readonly lastAttemptAt: string | null;
  readonly lastFailure: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SaveMcpUpstreamTokenInput {
  readonly tokenEncrypted: Buffer;
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly attemptedAt: string;
}

export interface RecordMcpUpstreamFailureInput {
  readonly message: string;
  readonly attemptedAt: string;
}

export class McpUpstreamCredentialRepository extends Context.Service<
  McpUpstreamCredentialRepository,
  {
    readonly listCredentials: Effect.Effect<ReadonlyArray<McpUpstreamCredentialRow>, DatabaseError>;
    readonly listEnvironmentCredentials: (
      environmentId: string,
    ) => Effect.Effect<ReadonlyArray<McpUpstreamCredentialRow>, DatabaseError>;
    readonly findCredential: (
      environmentId: string,
      access: McpAccess,
    ) => Effect.Effect<McpUpstreamCredentialRow | undefined, DatabaseError>;
    readonly saveToken: (
      environmentId: string,
      access: McpAccess,
      input: SaveMcpUpstreamTokenInput,
    ) => Effect.Effect<void, DatabaseError>;
    /** Forgets a token the environment no longer accepts, unless it was already replaced. */
    readonly clearToken: (
      environmentId: string,
      access: McpAccess,
      sessionId: string,
    ) => Effect.Effect<void, DatabaseError>;
    readonly recordFailure: (
      environmentId: string,
      access: McpAccess,
      input: RecordMcpUpstreamFailureInput,
    ) => Effect.Effect<void, DatabaseError>;
  }
>()(
  "@t3code-gateway/server/db/mcp-upstream-credential-repository/McpUpstreamCredentialRepository",
) {}

export const make = Effect.gen(function* () {
  const { db } = yield* GatewayDatabase;

  const listCredentials = db
    .select()
    .from(mcpUpstreamCredentials)
    .all()
    .pipe(
      Effect.catchTags({ EffectDrizzleQueryError: (error) => queryError("mcpCredential", error) }),
    );

  const listEnvironmentCredentials = (environmentId: string) =>
    db
      .select()
      .from(mcpUpstreamCredentials)
      .where(eq(mcpUpstreamCredentials.environmentId, environmentId))
      .all()
      .pipe(
        Effect.catchTags({
          EffectDrizzleQueryError: (error) => queryError("mcpCredential", error),
        }),
      );

  const findCredential = (environmentId: string, access: McpAccess) =>
    db
      .select()
      .from(mcpUpstreamCredentials)
      .where(
        and(
          eq(mcpUpstreamCredentials.environmentId, environmentId),
          eq(mcpUpstreamCredentials.access, access),
        ),
      )
      .get()
      .pipe(
        Effect.catchTags({
          EffectDrizzleQueryError: (error) => queryError("mcpCredential", error),
        }),
      );

  const saveToken = (
    environmentId: string,
    access: McpAccess,
    input: SaveMcpUpstreamTokenInput,
  ) => {
    const fields = {
      tokenEncrypted: input.tokenEncrypted,
      sessionId: input.sessionId,
      expiresAt: input.expiresAt,
      lastAttemptAt: input.attemptedAt,
      lastFailure: null,
      updatedAt: input.attemptedAt,
    };
    return db
      .insert(mcpUpstreamCredentials)
      .values({ environmentId, access, createdAt: input.attemptedAt, ...fields })
      .onConflictDoUpdate({
        target: [mcpUpstreamCredentials.environmentId, mcpUpstreamCredentials.access],
        set: fields,
      })
      .run()
      .pipe(
        Effect.asVoid,
        Effect.catchTags({
          EffectDrizzleQueryError: (error) => queryError("mcpCredential", error),
        }),
      );
  };

  const clearToken = (environmentId: string, access: McpAccess, sessionId: string) =>
    db
      .update(mcpUpstreamCredentials)
      .set({ tokenEncrypted: null, sessionId: null, expiresAt: null })
      .where(
        and(
          eq(mcpUpstreamCredentials.environmentId, environmentId),
          eq(mcpUpstreamCredentials.access, access),
          eq(mcpUpstreamCredentials.sessionId, sessionId),
        ),
      )
      .run()
      .pipe(
        Effect.asVoid,
        Effect.catchTags({
          EffectDrizzleQueryError: (error) => queryError("mcpCredential", error),
        }),
      );

  // A failure keeps the current token: it stays usable until it expires.
  const recordFailure = (
    environmentId: string,
    access: McpAccess,
    input: RecordMcpUpstreamFailureInput,
  ) => {
    const fields = {
      lastAttemptAt: input.attemptedAt,
      lastFailure: input.message,
      updatedAt: input.attemptedAt,
    };
    return db
      .insert(mcpUpstreamCredentials)
      .values({ environmentId, access, createdAt: input.attemptedAt, ...fields })
      .onConflictDoUpdate({
        target: [mcpUpstreamCredentials.environmentId, mcpUpstreamCredentials.access],
        set: fields,
      })
      .run()
      .pipe(
        Effect.asVoid,
        Effect.catchTags({
          EffectDrizzleQueryError: (error) => queryError("mcpCredential", error),
        }),
      );
  };

  return McpUpstreamCredentialRepository.of({
    listCredentials,
    listEnvironmentCredentials,
    findCredential,
    saveToken,
    clearToken,
    recordFailure,
  });
});

export const layer = Layer.effect(McpUpstreamCredentialRepository, make);
