import type {
  CreatedMcpToken,
  CreateMcpTokenRequest,
  McpAccess,
  McpGrant,
} from "@t3code-gateway/contracts/schemas";
import { McpFailure } from "@t3code-gateway/contracts/schemas";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

import { hashSessionToken } from "../auth/session.ts";
import { EnvironmentRepository } from "../db/environment-repository.ts";
import { DatabaseError } from "../db/errors.ts";
import { McpGrantRepository, type McpGrantRow } from "../db/mcp-grant-repository.ts";

const TOKEN_PREFIX = "t3gw_";
const MAX_LABEL_LENGTH = 100;
const MAX_TOKEN_LIFETIME_DAYS = 3650;
// Recording every request would write to SQLite on each tool call.
const LAST_USED_RESOLUTION = "1 minute";

const EnvironmentIdsFromJson = Schema.fromJsonString(Schema.Array(Schema.String));
const encodeEnvironmentIds = Schema.encodeSync(EnvironmentIdsFromJson);
const decodeEnvironmentIds = Schema.decodeSync(EnvironmentIdsFromJson);

const platformFailure = (error: PlatformError.PlatformError) =>
  Effect.fail(new DatabaseError({ operation: "mcpGrant", reason: "unknown", cause: error }));

/** Who is calling the relay, as resolved from their bearer token. */
export interface McpCaller {
  readonly grantId: string;
  readonly label: string;
  readonly access: McpAccess;
  /** `null` reaches every environment. */
  readonly environmentIds: ReadonlyArray<string> | null;
}

export const grantRecord = (row: McpGrantRow): McpGrant => ({
  grantId: row.grantId,
  kind: row.kind,
  label: row.label,
  access: row.access,
  environmentIds:
    row.environmentIdsJson === null ? null : decodeEnvironmentIds(row.environmentIdsJson),
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
  expiresAt: row.expiresAt,
});

/** A new random bearer token and the hash the gateway stores for it. */
export const createBearerToken = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const token = `${TOKEN_PREFIX}${Encoding.encodeBase64Url(yield* crypto.randomBytes(32))}`;
  return { token, tokenHash: yield* hashSessionToken(token) };
});

export class McpGrants extends Context.Service<
  McpGrants,
  {
    readonly list: Effect.Effect<ReadonlyArray<McpGrant>, DatabaseError>;
    readonly createToken: (
      input: CreateMcpTokenRequest,
      createdByUserId: string | null,
    ) => Effect.Effect<CreatedMcpToken, McpFailure | DatabaseError>;
    readonly revoke: (grantId: string) => Effect.Effect<void, McpFailure | DatabaseError>;
    /** The caller a bearer token belongs to, or `null` for an unknown or expired token. */
    readonly authenticate: (bearerToken: string) => Effect.Effect<McpCaller | null, DatabaseError>;
    /** Checks a grant's label and environments before it is stored. */
    readonly validateGrant: (input: {
      readonly label: string;
      readonly environmentIds: ReadonlyArray<string> | null;
    }) => Effect.Effect<
      { readonly label: string; readonly environmentIdsJson: string | null },
      McpFailure | DatabaseError
    >;
  }
>()("@t3code-gateway/server/mcp/grants/McpGrants") {}

export const make = Effect.gen(function* () {
  const grants = yield* McpGrantRepository;
  const environments = yield* EnvironmentRepository;
  const crypto = yield* Crypto.Crypto;

  const list = Effect.gen(function* () {
    yield* grants.deleteExpired(DateTime.formatIso(yield* DateTime.now));
    const rows = yield* grants.listGrants;
    return rows.map(grantRecord);
  });

  const validateGrant = (input: {
    readonly label: string;
    readonly environmentIds: ReadonlyArray<string> | null;
  }) =>
    Effect.gen(function* () {
      const label = input.label.trim();
      if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
        return yield* new McpFailure({
          message: `Label must be 1 to ${MAX_LABEL_LENGTH} characters`,
        });
      }
      if (input.environmentIds === null) {
        return { label, environmentIdsJson: null };
      }
      const environmentIds = [...new Set(input.environmentIds)];
      if (environmentIds.length === 0) {
        return yield* new McpFailure({ message: "Choose at least one environment" });
      }
      const known = new Set((yield* environments.listEnvironments).map((row) => row.environmentId));
      const unknown = environmentIds.find((environmentId) => !known.has(environmentId));
      if (unknown !== undefined) {
        return yield* new McpFailure({ message: `Unknown environment ${unknown}` });
      }
      return { label, environmentIdsJson: encodeEnvironmentIds(environmentIds) };
    });

  const createToken = (input: CreateMcpTokenRequest, createdByUserId: string | null) =>
    Effect.gen(function* () {
      const grant = yield* validateGrant(input);
      if (
        input.expiresInDays !== null &&
        (input.expiresInDays < 1 || input.expiresInDays > MAX_TOKEN_LIFETIME_DAYS)
      ) {
        return yield* new McpFailure({
          message: `Expiry must be 1 to ${MAX_TOKEN_LIFETIME_DAYS} days`,
        });
      }

      const now = yield* DateTime.now;
      const createdAt = DateTime.formatIso(now);
      const expiresAt =
        input.expiresInDays === null
          ? null
          : DateTime.formatIso(DateTime.add(now, { days: input.expiresInDays }));
      const { token, tokenHash } = yield* createBearerToken.pipe(
        Effect.provideService(Crypto.Crypto, crypto),
      );
      const row: McpGrantRow = {
        grantId: yield* crypto.randomUUIDv4,
        kind: "token",
        label: grant.label,
        access: input.access,
        environmentIdsJson: grant.environmentIdsJson,
        clientId: null,
        createdByUserId,
        createdAt,
        lastUsedAt: null,
        expiresAt,
      };
      yield* grants.createGrant(row, [
        { tokenHash, grantId: row.grantId, kind: "access", expiresAt, createdAt },
      ]);
      return { grant: grantRecord(row), token } satisfies CreatedMcpToken;
    }).pipe(Effect.catchTags({ PlatformError: platformFailure }));

  const revoke = (grantId: string) =>
    Effect.gen(function* () {
      const deleted = yield* grants.deleteGrant(grantId);
      if (!deleted) {
        return yield* new McpFailure({ message: "Grant not found" });
      }
    });

  const authenticate = (bearerToken: string) =>
    Effect.gen(function* () {
      const now = yield* DateTime.now;
      const tokenHash = yield* hashSessionToken(bearerToken).pipe(
        Effect.provideService(Crypto.Crypto, crypto),
        Effect.catchTags({ PlatformError: platformFailure }),
      );
      const row = yield* grants.findGrantByTokenHash(tokenHash, DateTime.formatIso(now));
      if (row === undefined) {
        return null;
      }

      const lastUsedAt =
        row.lastUsedAt === null ? null : Option.getOrNull(DateTime.make(row.lastUsedAt));
      if (
        lastUsedAt === null ||
        DateTime.isLessThan(DateTime.addDuration(lastUsedAt, LAST_USED_RESOLUTION), now)
      ) {
        yield* grants.touchGrant(row.grantId, DateTime.formatIso(now));
      }

      const record = grantRecord(row);
      return {
        grantId: record.grantId,
        label: record.label,
        access: record.access,
        environmentIds: record.environmentIds,
      } satisfies McpCaller;
    });

  return McpGrants.of({ list, createToken, revoke, authenticate, validateGrant });
});

export const layer = Layer.effect(McpGrants, make);
