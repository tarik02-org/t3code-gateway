import type { EnvironmentInput } from "@t3code-gateway/contracts/schemas";
import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import type { GatewayConfig } from "../config.ts";
import { EnvironmentRepository } from "../db/environment-repository.ts";
import { DatabaseError } from "../db/errors.ts";
import { ADMIN_TOKEN_SCOPES, DEFAULT_ENVIRONMENT_BROWSER_TOKEN_SCOPES } from "./constants.ts";
import { isDnsSafeSlug } from "./slug.ts";
import {
  exchangePairingCodeForBearerToken,
  fetchEnvironmentDescriptor,
  readEnvironmentId,
  readEnvironmentLabel,
  validateAdminBearerToken,
} from "./t3code-client.ts";
import { computePublicUrls, hasUrlUserinfo, isAbsoluteHttpUrl, isHttpOriginUrl } from "./urls.ts";

export interface ValidatedEnvironmentInput {
  readonly slug: string;
  readonly label: string;
  readonly endpoint: string;
  readonly adminBearerToken: string;
  readonly adminTokenExpiresAt: string | null;
  readonly adminTokenLastCheckedAt: string | null;
  readonly browserTokenScopes: ReadonlyArray<string>;
  readonly environmentId: string;
  readonly descriptor: unknown;
  readonly publicUrl: string;
}

export interface EnvironmentValidationContext {
  readonly environmentRepository: EnvironmentRepository["Service"];
  readonly config: GatewayConfig;
  readonly client: HttpClient.HttpClient;
}

const resolveBrowserTokenScopes = (scopes: ReadonlyArray<string> | undefined) =>
  scopes === undefined || scopes.length === 0
    ? [...DEFAULT_ENVIRONMENT_BROWSER_TOKEN_SCOPES]
    : [...scopes];

const environmentSlug = (environmentId: string) => `env-${environmentId.toLowerCase()}`;

export const validateEnvironmentInput = (
  context: EnvironmentValidationContext,
  input: EnvironmentInput,
  options?: { readonly excludeEnvironmentId?: string },
): Effect.Effect<ValidatedEnvironmentInput, EnvironmentFailure | DatabaseError> =>
  Effect.gen(function* () {
    const { environmentRepository, config, client } = context;

    const requestedEnvironmentId = input.environmentId ?? "";
    const endpoint = input.endpoint;
    const adminBearerToken = input.adminBearerToken ?? "";
    const pairingCode = input.pairingCode ?? "";

    if (hasUrlUserinfo(endpoint)) {
      return yield* new EnvironmentFailure({
        message: "Endpoint must not include username or password",
      });
    }

    if (!isAbsoluteHttpUrl(endpoint)) {
      return yield* new EnvironmentFailure({
        message: "Endpoint must be an absolute http or https URL",
      });
    }

    if (!isHttpOriginUrl(endpoint)) {
      return yield* new EnvironmentFailure({
        message: "Endpoint must not include path, query, or fragment",
      });
    }

    const descriptor = yield* fetchEnvironmentDescriptor(client, endpoint);
    const descriptorEnvironmentId = readEnvironmentId(descriptor);
    if (
      requestedEnvironmentId.length > 0 &&
      descriptorEnvironmentId !== null &&
      descriptorEnvironmentId !== requestedEnvironmentId
    ) {
      return yield* new EnvironmentFailure({
        message: "Environment descriptor ID does not match",
      });
    }

    const environmentId = descriptorEnvironmentId ?? requestedEnvironmentId;
    if (environmentId.length === 0) {
      return yield* new EnvironmentFailure({
        message: "Environment descriptor is missing a valid environmentId",
      });
    }

    const slug = input.slug ?? environmentSlug(environmentId);
    const label = input.label ?? readEnvironmentLabel(descriptor) ?? environmentId;

    if (!isDnsSafeSlug(slug)) {
      return yield* new EnvironmentFailure({
        message:
          "Slug must be DNS-safe: lowercase letters, digits, and hyphens, starting with a letter",
      });
    }

    if (label.length === 0) {
      return yield* new EnvironmentFailure({ message: "Label is required" });
    }

    const slugConflict = yield* environmentRepository.findEnvironmentIdBySlug(slug);

    if (slugConflict !== undefined && slugConflict !== options?.excludeEnvironmentId) {
      return yield* new EnvironmentFailure({ message: `Slug "${slug}" is already in use` });
    }

    const environmentIdConflict = yield* environmentRepository.findConflictingEnvironmentId(
      environmentId,
      options?.excludeEnvironmentId,
    );

    if (environmentIdConflict !== undefined) {
      return yield* new EnvironmentFailure({
        message: `Environment ID "${environmentId}" is already registered`,
      });
    }

    const resolvedAdminBearerToken =
      adminBearerToken.length > 0
        ? adminBearerToken
        : pairingCode.length > 0
          ? yield* exchangePairingCodeForBearerToken(
              client,
              endpoint,
              pairingCode,
              ADMIN_TOKEN_SCOPES,
            )
          : "";

    const adminTokenSession =
      resolvedAdminBearerToken.length === 0
        ? null
        : yield* validateAdminBearerToken(client, endpoint, resolvedAdminBearerToken);
    if (adminTokenSession !== null) {
      const missingScope = ADMIN_TOKEN_SCOPES.find(
        (scope) => !adminTokenSession.scopes.includes(scope),
      );
      if (missingScope !== undefined) {
        return yield* new EnvironmentFailure({
          message: `Admin bearer token is missing required scope ${missingScope}`,
        });
      }
    }
    const adminTokenLastCheckedAt =
      adminTokenSession === null ? null : DateTime.formatIso(yield* DateTime.now);

    const publicUrls = computePublicUrls(slug, config.publicBaseDomain);

    return {
      slug,
      label,
      endpoint,
      adminBearerToken: resolvedAdminBearerToken,
      adminTokenExpiresAt: adminTokenSession === null ? null : adminTokenSession.expiresAt,
      adminTokenLastCheckedAt,
      browserTokenScopes: resolveBrowserTokenScopes(input.browserTokenScopes),
      environmentId,
      descriptor,
      publicUrl: publicUrls.publicHttpBaseUrl,
    } satisfies ValidatedEnvironmentInput;
  });
