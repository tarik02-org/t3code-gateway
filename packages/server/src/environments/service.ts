import type {
  CreateEnvironmentPairingLinkRequest,
  EnvironmentClientSession,
  EnvironmentInput,
  EnvironmentPairingLink,
  EnvironmentRecord,
  RevokeEnvironmentClientResponse,
  T3CodeCatalogEntryRequest,
  T3CodeCatalogEntryResponse,
  UpdateEnvironmentRequest,
  ValidateEnvironmentResponse,
} from "@t3code-gateway/contracts/schemas";
import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { SecretEncryption } from "../crypto/secret-encryption.ts";
import { GatewayRuntimeConfig } from "../config.ts";
import { EnvironmentRepository, type EnvironmentRow } from "../db/environment-repository.ts";
import { DatabaseError } from "../db/errors.ts";
import {
  decodeStringArrayJson,
  decodeUnknownJson,
  encodeStringArrayJson,
  encodeUnknownJson,
} from "./json-codecs.ts";
import { isDnsSafeSlug } from "./slug.ts";
import { validateEnvironmentInput } from "./validation.ts";
import { computePublicUrls } from "./urls.ts";
import {
  createBearerTokenForClient,
  createPairingCredential,
  listClientSessions,
  revokeClientSession,
} from "./t3code-client.ts";

export class EnvironmentService extends Context.Service<
  EnvironmentService,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<EnvironmentRecord>, DatabaseError>;
    readonly get: (
      environmentId: string,
    ) => Effect.Effect<EnvironmentRecord, EnvironmentFailure | DatabaseError>;
    readonly create: (
      input: EnvironmentInput,
    ) => Effect.Effect<EnvironmentRecord, EnvironmentFailure | DatabaseError>;
    readonly update: (
      environmentId: string,
      input: UpdateEnvironmentRequest,
    ) => Effect.Effect<EnvironmentRecord, EnvironmentFailure | DatabaseError>;
    readonly remove: (
      environmentId: string,
    ) => Effect.Effect<void, EnvironmentFailure | DatabaseError>;
    readonly validate: (
      input: EnvironmentInput,
    ) => Effect.Effect<ValidateEnvironmentResponse, EnvironmentFailure | DatabaseError>;
    readonly validateForEdit: (
      environmentId: string,
      input: EnvironmentInput,
    ) => Effect.Effect<ValidateEnvironmentResponse, EnvironmentFailure | DatabaseError>;
    readonly listClients: (
      environmentId: string,
    ) => Effect.Effect<ReadonlyArray<EnvironmentClientSession>, EnvironmentFailure | DatabaseError>;
    readonly createPairingLink: (
      environmentId: string,
      input: CreateEnvironmentPairingLinkRequest,
    ) => Effect.Effect<EnvironmentPairingLink, EnvironmentFailure | DatabaseError>;
    readonly createT3CodeCatalogEntry: (
      environmentId: string,
      input: T3CodeCatalogEntryRequest,
    ) => Effect.Effect<T3CodeCatalogEntryResponse, EnvironmentFailure | DatabaseError>;
    readonly revokeClient: (
      environmentId: string,
      sessionId: string,
    ) => Effect.Effect<RevokeEnvironmentClientResponse, EnvironmentFailure | DatabaseError>;
  }
>()("@t3code-gateway/server/environments/service/EnvironmentService") {}

const rowToRecord = (row: EnvironmentRow, publicBaseDomain: string): EnvironmentRecord => {
  const publicUrls = computePublicUrls(row.slug, publicBaseDomain);
  return {
    environmentId: row.environmentId,
    slug: row.slug,
    label: row.label,
    enabled: row.enabled,
    endpoint: row.endpoint,
    publicUrl: publicUrls.publicHttpBaseUrl,
    descriptor:
      row.descriptorJson === null || row.descriptorJson === undefined
        ? undefined
        : decodeUnknownJson(row.descriptorJson),
    browserTokenScopes: decodeStringArrayJson(row.browserTokenScopesJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const gatewayConnectionId = (environmentId: string) => `gateway:${environmentId}`;

const buildPairingUrl = (publicHttpBaseUrl: string, credential: string) => {
  const url = new URL(publicHttpBaseUrl);
  url.pathname = "/pair";
  url.search = "";
  url.hash = new URLSearchParams([["token", credential]]).toString();
  return url.toString();
};

export const make = Effect.gen(function* () {
  const environmentRepository = yield* EnvironmentRepository;
  const secrets = yield* SecretEncryption;
  const config = yield* GatewayRuntimeConfig;
  const client = yield* HttpClient.HttpClient;
  const validationContext = { environmentRepository, config, client };

  const list = () =>
    Effect.gen(function* () {
      const rows = yield* environmentRepository.listEnvironments;
      return rows.map((row) => rowToRecord(row, config.publicBaseDomain));
    });

  const get = (environmentId: string) =>
    Effect.gen(function* () {
      const row = yield* environmentRepository.findEnvironment(environmentId);

      if (row === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      return rowToRecord(row, config.publicBaseDomain);
    });

  const create = (input: EnvironmentInput) =>
    Effect.gen(function* () {
      const validated = yield* validateEnvironmentInput(validationContext, input);
      const encryptedToken = yield* secrets.encrypt(validated.adminBearerToken).pipe(
        Effect.catchTags({
          SecretEncryptionError: (error) =>
            Effect.fail(
              new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
            ),
        }),
      );
      const timestamp = DateTime.formatIso(DateTime.nowUnsafe());

      yield* environmentRepository.createEnvironment({
        environmentId: validated.environmentId,
        slug: validated.slug,
        label: validated.label,
        enabled: true,
        endpoint: validated.endpoint,
        descriptorJson: encodeUnknownJson(validated.descriptor),
        browserTokenScopesJson: encodeStringArrayJson(validated.browserTokenScopes),
        adminTokenEncrypted: encryptedToken,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      return yield* get(validated.environmentId);
    });

  const update = (environmentId: string, input: UpdateEnvironmentRequest) =>
    Effect.gen(function* () {
      const existing = yield* environmentRepository.findEnvironment(environmentId);

      if (existing === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      const needsRevalidation =
        (input.endpoint !== undefined && input.endpoint !== existing.endpoint) ||
        input.pairingCode !== undefined ||
        input.adminBearerToken !== undefined;

      let nextValues: {
        slug: string;
        label: string;
        endpoint: string;
        descriptorJson: string;
        browserTokenScopesJson: string;
        adminTokenEncrypted: Buffer;
        enabled: boolean;
      };

      if (needsRevalidation) {
        const decryptedToken = yield* secrets.decrypt(existing.adminTokenEncrypted).pipe(
          Effect.catchTags({
            SecretEncryptionError: (error) =>
              Effect.fail(
                new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
              ),
          }),
        );

        const validated = yield* validateEnvironmentInput(
          validationContext,
          {
            slug: input.slug ?? existing.slug,
            label: input.label ?? existing.label,
            endpoint: input.endpoint ?? existing.endpoint,
            ...(input.adminBearerToken !== undefined
              ? { adminBearerToken: input.adminBearerToken }
              : input.pairingCode !== undefined
                ? { pairingCode: input.pairingCode }
                : { adminBearerToken: decryptedToken }),
            browserTokenScopes:
              input.browserTokenScopes ?? decodeStringArrayJson(existing.browserTokenScopesJson),
          },
          { excludeEnvironmentId: environmentId },
        );

        if (validated.environmentId !== environmentId) {
          return yield* new EnvironmentFailure({
            message: "Environment descriptor ID does not match the registered environment",
          });
        }

        const encryptedToken = yield* secrets.encrypt(validated.adminBearerToken).pipe(
          Effect.catchTags({
            SecretEncryptionError: (error) =>
              Effect.fail(
                new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
              ),
          }),
        );

        nextValues = {
          slug: validated.slug,
          label: validated.label,
          endpoint: validated.endpoint,
          descriptorJson: encodeUnknownJson(validated.descriptor),
          browserTokenScopesJson: encodeStringArrayJson(validated.browserTokenScopes),
          adminTokenEncrypted: encryptedToken,
          enabled: input.enabled ?? existing.enabled,
        };
      } else {
        const slug = input.slug ?? existing.slug;
        const label = input.label ?? existing.label;

        if (!isDnsSafeSlug(slug)) {
          return yield* new EnvironmentFailure({
            message:
              "Slug must be DNS-safe: lowercase letters, digits, and hyphens, starting with a letter",
          });
        }

        if (label.length === 0) {
          return yield* new EnvironmentFailure({ message: "Label is required" });
        }

        if (slug !== existing.slug) {
          const slugConflict = yield* environmentRepository.findEnvironmentIdBySlug(slug);
          if (slugConflict !== undefined && slugConflict !== environmentId) {
            return yield* new EnvironmentFailure({ message: `Slug "${slug}" is already in use` });
          }
        }

        nextValues = {
          slug,
          label,
          endpoint: existing.endpoint,
          descriptorJson: existing.descriptorJson ?? encodeUnknownJson(null),
          browserTokenScopesJson: encodeStringArrayJson(
            input.browserTokenScopes ?? decodeStringArrayJson(existing.browserTokenScopesJson),
          ),
          adminTokenEncrypted: existing.adminTokenEncrypted,
          enabled: input.enabled ?? existing.enabled,
        };
      }

      const timestamp = DateTime.formatIso(DateTime.nowUnsafe());
      yield* environmentRepository.updateEnvironment(environmentId, {
        ...nextValues,
        updatedAt: timestamp,
      });

      return yield* get(environmentId);
    });

  const remove = (environmentId: string) =>
    Effect.gen(function* () {
      const existing = yield* environmentRepository.findEnvironment(environmentId);

      if (existing === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      yield* environmentRepository.deleteEnvironment(environmentId);
    });

  const validate = (input: EnvironmentInput) =>
    Effect.gen(function* () {
      const validated = yield* validateEnvironmentInput(validationContext, input);
      return {
        environmentId: validated.environmentId,
        descriptor: validated.descriptor,
        publicUrl: validated.publicUrl,
      } satisfies ValidateEnvironmentResponse;
    });

  const validateForEdit = (environmentId: string, input: EnvironmentInput) =>
    Effect.gen(function* () {
      const existing = yield* environmentRepository.findEnvironment(environmentId);

      if (existing === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      const validated = yield* validateEnvironmentInput(validationContext, input, {
        excludeEnvironmentId: environmentId,
      });

      if (validated.environmentId !== environmentId) {
        return yield* new EnvironmentFailure({
          message: "Environment descriptor ID does not match the registered environment",
        });
      }

      return {
        environmentId: validated.environmentId,
        descriptor: validated.descriptor,
        publicUrl: validated.publicUrl,
      } satisfies ValidateEnvironmentResponse;
    });

  const listClients = (environmentId: string) =>
    Effect.gen(function* () {
      const row = yield* environmentRepository.findEnvironment(environmentId);

      if (row === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      const adminBearerToken = yield* secrets.decrypt(row.adminTokenEncrypted).pipe(
        Effect.catchTags({
          SecretEncryptionError: (error) =>
            Effect.fail(
              new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
            ),
        }),
      );
      if (adminBearerToken.length === 0) {
        return [];
      }

      const sessions = yield* listClientSessions(client, row.endpoint, adminBearerToken);

      return sessions.map((session) =>
        Object.assign({}, session, {
          gatewayRole: session.current ? ("admin" as const) : undefined,
        }),
      );
    });

  const createPairingLink = (environmentId: string, input: CreateEnvironmentPairingLinkRequest) =>
    Effect.gen(function* () {
      if (input.label.length === 0) {
        return yield* new EnvironmentFailure({ message: "Client label is required" });
      }
      if (input.scopes.length === 0) {
        return yield* new EnvironmentFailure({ message: "At least one permission is required" });
      }

      const row = yield* environmentRepository.findEnvironment(environmentId);

      if (row === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      const adminBearerToken = yield* secrets.decrypt(row.adminTokenEncrypted).pipe(
        Effect.catchTags({
          SecretEncryptionError: (error) =>
            Effect.fail(
              new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
            ),
        }),
      );
      if (adminBearerToken.length === 0) {
        return yield* new EnvironmentFailure({ message: "Admin bearer token is required" });
      }

      const pairingCode = yield* createPairingCredential(
        client,
        row.endpoint,
        adminBearerToken,
        input,
      );
      const publicUrls = computePublicUrls(row.slug, config.publicBaseDomain);

      return {
        label: input.label,
        scopes: input.scopes,
        pairingCode,
        pairingUrl: buildPairingUrl(publicUrls.publicHttpBaseUrl, pairingCode),
      } satisfies EnvironmentPairingLink;
    });

  const createT3CodeCatalogEntry = (environmentId: string, input: T3CodeCatalogEntryRequest) =>
    Effect.gen(function* () {
      const row = yield* environmentRepository.findEnvironment(environmentId);

      if (row === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      if (!row.enabled) {
        return yield* new EnvironmentFailure({ message: "Environment is disabled", status: 409 });
      }

      const scopes = decodeStringArrayJson(row.browserTokenScopesJson);
      const adminBearerToken = yield* secrets.decrypt(row.adminTokenEncrypted).pipe(
        Effect.catchTags({
          SecretEncryptionError: (error) =>
            Effect.fail(
              new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
            ),
        }),
      );
      if (adminBearerToken.length === 0) {
        return yield* new EnvironmentFailure({ message: "Admin bearer token is required" });
      }

      const bearerToken = yield* createBearerTokenForClient(
        client,
        row.endpoint,
        adminBearerToken,
        {
          label:
            input.clientLabel === undefined || input.clientLabel.length === 0
              ? "gateway"
              : input.clientLabel,
          scopes,
        },
      );
      const publicUrls = computePublicUrls(row.slug, config.publicBaseDomain);

      return {
        schemaVersion: 1 as const,
        target: {
          _tag: "BearerConnectionTarget" as const,
          environmentId: row.environmentId,
          label: row.label,
          connectionId: gatewayConnectionId(row.environmentId),
        },
        profile: {
          _tag: "BearerConnectionProfile" as const,
          connectionId: gatewayConnectionId(row.environmentId),
          environmentId: row.environmentId,
          label: row.label,
          httpBaseUrl: publicUrls.publicHttpBaseUrl,
          wsBaseUrl: publicUrls.publicWsBaseUrl,
        },
        credential: {
          connectionId: gatewayConnectionId(row.environmentId),
          credential: {
            _tag: "BearerConnectionCredential" as const,
            token: bearerToken.accessToken,
          },
        },
      } satisfies T3CodeCatalogEntryResponse;
    });

  const revokeClient = (environmentId: string, sessionId: string) =>
    Effect.gen(function* () {
      const trimmedSessionId = sessionId.trim();
      if (trimmedSessionId.length === 0) {
        return yield* new EnvironmentFailure({ message: "Client session ID is required" });
      }

      const row = yield* environmentRepository.findEnvironment(environmentId);

      if (row === undefined) {
        return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
      }

      const adminBearerToken = yield* secrets.decrypt(row.adminTokenEncrypted).pipe(
        Effect.catchTags({
          SecretEncryptionError: (error) =>
            Effect.fail(
              new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
            ),
        }),
      );
      if (adminBearerToken.length === 0) {
        return yield* new EnvironmentFailure({ message: "Admin bearer token is required" });
      }

      const result = yield* revokeClientSession(
        client,
        row.endpoint,
        adminBearerToken,
        trimmedSessionId,
      );

      return result;
    });
  return EnvironmentService.of({
    list,
    get,
    create,
    update,
    remove,
    validate,
    validateForEdit,
    listClients,
    createPairingLink,
    createT3CodeCatalogEntry,
    revokeClient,
  });
});

export const layer = Layer.effect(EnvironmentService, make);
