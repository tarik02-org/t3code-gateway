import { and, eq, ne } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { GatewayDatabase } from "./database.ts";
import { DatabaseError, queryError } from "./errors.ts";
import { environments } from "./schema.ts";

export interface EnvironmentRow {
  readonly environmentId: string;
  readonly slug: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly endpoint: string;
  readonly descriptorJson: string | null;
  readonly browserTokenScopesJson: string;
  readonly adminTokenEncrypted: Buffer;
  readonly adminTokenExpiresAt: string | null;
  readonly adminTokenLastCheckedAt: string | null;
  readonly adminTokenFailureJson: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateEnvironmentInput {
  readonly environmentId: string;
  readonly slug: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly endpoint: string;
  readonly descriptorJson: string;
  readonly browserTokenScopesJson: string;
  readonly adminTokenEncrypted: Buffer;
  readonly adminTokenExpiresAt: string | null;
  readonly adminTokenLastCheckedAt: string | null;
  readonly adminTokenFailureJson: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface UpdateEnvironmentFields {
  readonly slug: string;
  readonly label: string;
  readonly endpoint: string;
  readonly descriptorJson: string;
  readonly browserTokenScopesJson: string;
  readonly enabled: boolean;
  readonly updatedAt: string;
}

export type UpdateEnvironmentInput =
  | (UpdateEnvironmentFields & { readonly _tag: "KeepAdminToken" })
  | (UpdateEnvironmentFields & {
      readonly _tag: "ReplaceAdminToken";
      readonly currentTokenEncrypted: Buffer;
      readonly adminTokenEncrypted: Buffer;
      readonly adminTokenExpiresAt: string | null;
      readonly adminTokenLastCheckedAt: string | null;
      readonly adminTokenFailureJson: string | null;
    });

export interface UpdateEnvironmentAdminTokenStateInput {
  readonly currentTokenEncrypted: Buffer;
  readonly expiresAt: string | null;
  readonly lastCheckedAt: string;
  readonly failureJson: string | null;
}

export interface ReplaceEnvironmentAdminTokenInput extends UpdateEnvironmentAdminTokenStateInput {
  readonly nextTokenEncrypted: Buffer;
}

export class EnvironmentRepository extends Context.Service<
  EnvironmentRepository,
  {
    readonly listEnvironments: Effect.Effect<ReadonlyArray<EnvironmentRow>, DatabaseError>;
    readonly findEnvironment: (
      environmentId: string,
    ) => Effect.Effect<EnvironmentRow | undefined, DatabaseError>;
    readonly createEnvironment: (
      input: CreateEnvironmentInput,
    ) => Effect.Effect<void, DatabaseError>;
    readonly updateEnvironment: (
      environmentId: string,
      input: UpdateEnvironmentInput,
    ) => Effect.Effect<boolean, DatabaseError>;
    readonly updateEnvironmentAdminTokenState: (
      environmentId: string,
      input: UpdateEnvironmentAdminTokenStateInput,
    ) => Effect.Effect<boolean, DatabaseError>;
    readonly replaceEnvironmentAdminToken: (
      environmentId: string,
      input: ReplaceEnvironmentAdminTokenInput,
    ) => Effect.Effect<boolean, DatabaseError>;
    readonly deleteEnvironment: (environmentId: string) => Effect.Effect<void, DatabaseError>;
    readonly findEnvironmentIdBySlug: (
      slug: string,
    ) => Effect.Effect<string | undefined, DatabaseError>;
    readonly findConflictingEnvironmentId: (
      environmentId: string,
      excludeEnvironmentId: string | undefined,
    ) => Effect.Effect<string | undefined, DatabaseError>;
  }
>()("@t3code-gateway/server/db/environment-repository/EnvironmentRepository") {}

export const make = Effect.gen(function* () {
  const { db } = yield* GatewayDatabase;

  const listEnvironments = db
    .select()
    .from(environments)
    .all()
    .pipe(
      Effect.catchTags({ EffectDrizzleQueryError: (error) => queryError("environment", error) }),
    );

  const findEnvironment = (environmentId: string) =>
    db
      .select()
      .from(environments)
      .where(eq(environments.environmentId, environmentId))
      .get()
      .pipe(
        Effect.catchTags({ EffectDrizzleQueryError: (error) => queryError("environment", error) }),
      );

  const createEnvironment = (input: CreateEnvironmentInput) =>
    db
      .insert(environments)
      .values(input)
      .run()
      .pipe(
        Effect.asVoid,
        Effect.catchTags({ EffectDrizzleQueryError: (error) => queryError("environment", error) }),
      );

  const updateEnvironment = (environmentId: string, input: UpdateEnvironmentInput) =>
    db
      .update(environments)
      .set(
        input["_tag"] === "KeepAdminToken"
          ? {
              slug: input.slug,
              label: input.label,
              endpoint: input.endpoint,
              descriptorJson: input.descriptorJson,
              browserTokenScopesJson: input.browserTokenScopesJson,
              enabled: input.enabled,
              updatedAt: input.updatedAt,
            }
          : {
              slug: input.slug,
              label: input.label,
              endpoint: input.endpoint,
              descriptorJson: input.descriptorJson,
              browserTokenScopesJson: input.browserTokenScopesJson,
              adminTokenEncrypted: input.adminTokenEncrypted,
              adminTokenExpiresAt: input.adminTokenExpiresAt,
              adminTokenLastCheckedAt: input.adminTokenLastCheckedAt,
              adminTokenFailureJson: input.adminTokenFailureJson,
              enabled: input.enabled,
              updatedAt: input.updatedAt,
            },
      )
      .where(
        input["_tag"] === "KeepAdminToken"
          ? eq(environments.environmentId, environmentId)
          : and(
              eq(environments.environmentId, environmentId),
              eq(environments.adminTokenEncrypted, input.currentTokenEncrypted),
            ),
      )
      .run()
      .pipe(
        Effect.map((result) => result.changes > 0),
        Effect.catchTags({ EffectDrizzleQueryError: (error) => queryError("environment", error) }),
      );

  const updateEnvironmentAdminTokenState = (
    environmentId: string,
    input: UpdateEnvironmentAdminTokenStateInput,
  ) =>
    db
      .update(environments)
      .set({
        adminTokenExpiresAt: input.expiresAt,
        adminTokenLastCheckedAt: input.lastCheckedAt,
        adminTokenFailureJson: input.failureJson,
      })
      .where(
        and(
          eq(environments.environmentId, environmentId),
          eq(environments.adminTokenEncrypted, input.currentTokenEncrypted),
        ),
      )
      .run()
      .pipe(
        Effect.map((result) => result.changes > 0),
        Effect.catchTags({ EffectDrizzleQueryError: (error) => queryError("environment", error) }),
      );

  const replaceEnvironmentAdminToken = (
    environmentId: string,
    input: ReplaceEnvironmentAdminTokenInput,
  ) =>
    db
      .update(environments)
      .set({
        adminTokenEncrypted: input.nextTokenEncrypted,
        adminTokenExpiresAt: input.expiresAt,
        adminTokenLastCheckedAt: input.lastCheckedAt,
        adminTokenFailureJson: input.failureJson,
      })
      .where(
        and(
          eq(environments.environmentId, environmentId),
          eq(environments.adminTokenEncrypted, input.currentTokenEncrypted),
        ),
      )
      .run()
      .pipe(
        Effect.map((result) => result.changes > 0),
        Effect.catchTags({ EffectDrizzleQueryError: (error) => queryError("environment", error) }),
      );

  const deleteEnvironment = (environmentId: string) =>
    db
      .delete(environments)
      .where(eq(environments.environmentId, environmentId))
      .run()
      .pipe(
        Effect.asVoid,
        Effect.catchTags({ EffectDrizzleQueryError: (error) => queryError("environment", error) }),
      );

  const findEnvironmentIdBySlug = (slug: string) =>
    db
      .select({ environmentId: environments.environmentId })
      .from(environments)
      .where(eq(environments.slug, slug))
      .get()
      .pipe(
        Effect.map((row) => row?.environmentId),
        Effect.catchTags({ EffectDrizzleQueryError: (error) => queryError("environment", error) }),
      );

  const findConflictingEnvironmentId = (
    environmentId: string,
    excludeEnvironmentId: string | undefined,
  ) =>
    db
      .select({ environmentId: environments.environmentId })
      .from(environments)
      .where(
        excludeEnvironmentId === undefined
          ? eq(environments.environmentId, environmentId)
          : and(
              eq(environments.environmentId, environmentId),
              ne(environments.environmentId, excludeEnvironmentId),
            ),
      )
      .get()
      .pipe(
        Effect.map((row) => row?.environmentId),
        Effect.catchTags({ EffectDrizzleQueryError: (error) => queryError("environment", error) }),
      );

  return EnvironmentRepository.of({
    listEnvironments,
    findEnvironment,
    createEnvironment,
    updateEnvironment,
    updateEnvironmentAdminTokenState,
    replaceEnvironmentAdminToken,
    deleteEnvironment,
    findEnvironmentIdBySlug,
    findConflictingEnvironmentId,
  });
});

export const layer = Layer.effect(EnvironmentRepository, make);
