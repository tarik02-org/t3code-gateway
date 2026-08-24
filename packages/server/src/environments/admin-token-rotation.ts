import type {
  EnvironmentAdminTokenStatus,
  EnvironmentClientSession,
} from "@t3code-gateway/contracts/schemas";
import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { SecretEncryption } from "../crypto/secret-encryption.ts";
import { EnvironmentRepository, type EnvironmentRow } from "../db/environment-repository.ts";
import { DatabaseError } from "../db/errors.ts";
import {
  ADMIN_TOKEN_ROTATION_WINDOW_MS,
  ADMIN_TOKEN_SCOPES,
  ADMIN_TOKEN_SWEEP_CONCURRENCY,
  ADMIN_TOKEN_SWEEP_INTERVAL,
  ADMIN_TOKEN_SWEEP_TIMEOUT,
} from "./constants.ts";
import {
  createPairingCredential,
  exchangePairingCodeForBearerAccessToken,
  revokeClientSession,
  validateAdminBearerToken,
} from "./t3code-client.ts";

const AdminTokenFailure = Schema.Union([
  Schema.TaggedStruct("Retrying", { message: Schema.String }),
  Schema.TaggedStruct("RepairRequired", { message: Schema.String }),
]);

type AdminTokenFailure = typeof AdminTokenFailure.Type;

const AdminTokenFailureFromJsonString = Schema.fromJsonString(AdminTokenFailure);

const encodeAdminTokenFailure = Schema.encodeSync(AdminTokenFailureFromJsonString);
const decodeAdminTokenFailure = Schema.decodeSync(AdminTokenFailureFromJsonString);

const adminSessionWithRequiredScopes = (session: EnvironmentClientSession) => {
  const missingScope = ADMIN_TOKEN_SCOPES.find((scope) => !session.scopes.includes(scope));
  return missingScope === undefined
    ? Effect.succeed(session)
    : Effect.fail(
        new EnvironmentFailure({
          message: `Admin bearer token is missing required scope ${missingScope}`,
          status: 403,
        }),
      );
};

const storedExpiry = (row: EnvironmentRow) =>
  row.adminTokenExpiresAt === null
    ? null
    : Option.getOrNull(DateTime.make(row.adminTokenExpiresAt));

const storedFailure = (row: EnvironmentRow): AdminTokenFailure | null =>
  row.adminTokenFailureJson === null ? null : decodeAdminTokenFailure(row.adminTokenFailureJson);

export const adminTokenStatus = (
  row: EnvironmentRow,
  now: DateTime.Utc,
): EnvironmentAdminTokenStatus => {
  const failure = storedFailure(row);
  if (!row.enabled) {
    return {
      _tag: "Paused",
      expiresAt: row.adminTokenExpiresAt,
      lastCheckedAt: row.adminTokenLastCheckedAt,
      lastFailure: failure?.message ?? null,
    };
  }
  if (failure !== null && failure["_tag"] === "RepairRequired") {
    return {
      _tag: "RepairRequired",
      expiresAt: row.adminTokenExpiresAt,
      lastAttemptAt: row.adminTokenLastCheckedAt ?? row.updatedAt,
      message: failure.message,
    };
  }
  if (failure !== null && failure["_tag"] === "Retrying") {
    return {
      _tag: "Retrying",
      expiresAt: row.adminTokenExpiresAt,
      lastAttemptAt: row.adminTokenLastCheckedAt ?? row.updatedAt,
      message: failure.message,
    };
  }
  const expiresAt = storedExpiry(row);
  if (expiresAt === null) {
    return { _tag: "Unknown" };
  }
  if (DateTime.isLessThanOrEqualTo(expiresAt, now)) {
    return {
      _tag: "RepairRequired",
      expiresAt: DateTime.formatIso(expiresAt),
      lastAttemptAt: row.adminTokenLastCheckedAt ?? row.updatedAt,
      message: "Admin bearer token expired and must be paired again",
    };
  }
  const rotationAt = DateTime.subtract(expiresAt, {
    milliseconds: ADMIN_TOKEN_ROTATION_WINDOW_MS,
  });
  return DateTime.isLessThanOrEqualTo(rotationAt, now)
    ? {
        _tag: "RotationDue",
        expiresAt: DateTime.formatIso(expiresAt),
        lastCheckedAt: row.adminTokenLastCheckedAt,
      }
    : {
        _tag: "Healthy",
        expiresAt: DateTime.formatIso(expiresAt),
        lastCheckedAt: row.adminTokenLastCheckedAt,
      };
};

export class AdminTokenRotation extends Context.Service<
  AdminTokenRotation,
  {
    readonly ensureFresh: (
      environmentId: string,
    ) => Effect.Effect<string, EnvironmentFailure | DatabaseError>;
    readonly sweep: Effect.Effect<void>;
  }
>()("@t3code-gateway/server/environments/admin-token-rotation/AdminTokenRotation") {}

export const makeAdminTokenRotation = Effect.fn("makeAdminTokenRotation")(function* () {
  const environmentRepository = yield* EnvironmentRepository;
  const secrets = yield* SecretEncryption;
  const client = yield* HttpClient.HttpClient;
  const locks = new Map<string, Semaphore.Semaphore>();

  const recordFailure = Effect.fn("AdminTokenRotation.recordFailure")(function* (
    row: EnvironmentRow,
    failure: AdminTokenFailure,
    attemptedAt: string,
  ) {
    yield* environmentRepository.updateEnvironmentAdminTokenState(row.environmentId, {
      currentTokenEncrypted: row.adminTokenEncrypted,
      expiresAt: row.adminTokenExpiresAt,
      lastCheckedAt: attemptedAt,
      failureJson: encodeAdminTokenFailure(failure),
    });
  });

  const maintain = Effect.fn("AdminTokenRotation.maintain")(function* (environmentId: string) {
    const row = yield* environmentRepository.findEnvironment(environmentId);
    if (row === undefined) {
      return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
    }

    const token = yield* secrets.decrypt(row.adminTokenEncrypted).pipe(
      Effect.catchTags({
        SecretEncryptionError: (error) =>
          Effect.fail(
            new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
          ),
      }),
    );
    if (token.length === 0) {
      const attemptedAt = DateTime.formatIso(yield* DateTime.now);
      const failure = new EnvironmentFailure({
        message: "Admin bearer token is required; pair the environment again",
        status: 401,
      });
      yield* recordFailure(row, { _tag: "RepairRequired", message: failure.message }, attemptedAt);
      return yield* failure;
    }

    if (!row.enabled) {
      return token;
    }

    const failure = storedFailure(row);
    if (failure !== null && failure["_tag"] === "RepairRequired") {
      return yield* new EnvironmentFailure({ message: failure.message, status: 401 });
    }

    const now = yield* DateTime.now;
    const expiresAt = storedExpiry(row);
    if (expiresAt !== null) {
      if (DateTime.isLessThanOrEqualTo(expiresAt, now)) {
        const attemptedAt = DateTime.formatIso(now);
        const expired = new EnvironmentFailure({
          message: "Admin bearer token expired; pair the environment again",
          status: 401,
        });
        yield* recordFailure(
          row,
          { _tag: "RepairRequired", message: expired.message },
          attemptedAt,
        );
        return yield* expired;
      }
      const rotationAt = DateTime.subtract(expiresAt, {
        milliseconds: ADMIN_TOKEN_ROTATION_WINDOW_MS,
      });
      if (DateTime.isGreaterThan(rotationAt, now) && failure === null) {
        return token;
      }
    }
    const lastAttemptAt =
      row.adminTokenLastCheckedAt === null
        ? null
        : Option.getOrNull(DateTime.make(row.adminTokenLastCheckedAt));
    if (
      failure !== null &&
      failure["_tag"] === "Retrying" &&
      lastAttemptAt !== null &&
      DateTime.isLessThan(now, DateTime.addDuration(lastAttemptAt, ADMIN_TOKEN_SWEEP_INTERVAL))
    ) {
      return token;
    }

    const currentSession = yield* validateAdminBearerToken(client, row.endpoint, token).pipe(
      Effect.flatMap(adminSessionWithRequiredScopes),
      Effect.catchTag("EnvironmentFailure", (error) =>
        Effect.gen(function* () {
          const attemptedAt = DateTime.formatIso(yield* DateTime.now);
          const repairRequired = error.status === 401 || error.status === 403;
          yield* recordFailure(
            row,
            repairRequired
              ? { _tag: "RepairRequired", message: error.message }
              : { _tag: "Retrying", message: error.message },
            attemptedAt,
          );
          yield* Effect.logWarning("Environment admin token validation failed").pipe(
            Effect.annotateLogs({
              environmentId: row.environmentId,
              repairRequired,
              reason: error.message,
            }),
          );
          if (repairRequired) {
            return yield* error;
          }
          return null;
        }),
      ),
    );
    if (currentSession === null) {
      return token;
    }

    const attempt = Effect.gen(function* () {
      const observedAt = yield* DateTime.now;
      const observedExpiry = Option.getOrNull(DateTime.make(currentSession.expiresAt));
      if (observedExpiry === null) {
        return yield* new EnvironmentFailure({
          message: "Environment returned an invalid admin token expiry",
        });
      }
      const observedRotationAt = DateTime.subtract(observedExpiry, {
        milliseconds: ADMIN_TOKEN_ROTATION_WINDOW_MS,
      });
      if (DateTime.isGreaterThan(observedRotationAt, observedAt)) {
        yield* environmentRepository.updateEnvironmentAdminTokenState(row.environmentId, {
          currentTokenEncrypted: row.adminTokenEncrypted,
          expiresAt: currentSession.expiresAt,
          lastCheckedAt: DateTime.formatIso(observedAt),
          failureJson: null,
        });
        return token;
      }

      const credential = yield* createPairingCredential(client, row.endpoint, token, {
        label: "gateway rotation",
        scopes: ADMIN_TOKEN_SCOPES,
      });
      const replacement = yield* exchangePairingCodeForBearerAccessToken(
        client,
        row.endpoint,
        credential,
        ADMIN_TOKEN_SCOPES,
      );
      const replacementSession = yield* validateAdminBearerToken(
        client,
        row.endpoint,
        replacement.accessToken,
      ).pipe(Effect.flatMap(adminSessionWithRequiredScopes));
      const checkedAt = DateTime.formatIso(yield* DateTime.now);
      const replacementEncrypted = yield* secrets.encrypt(replacement.accessToken).pipe(
        Effect.catchTags({
          SecretEncryptionError: (error) =>
            Effect.fail(
              new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
            ),
        }),
      );
      const replaced = yield* environmentRepository.replaceEnvironmentAdminToken(
        row.environmentId,
        {
          currentTokenEncrypted: row.adminTokenEncrypted,
          nextTokenEncrypted: replacementEncrypted,
          expiresAt: replacementSession.expiresAt,
          lastCheckedAt: checkedAt,
          failureJson: null,
        },
      );
      if (!replaced) {
        yield* revokeClientSession(
          client,
          row.endpoint,
          replacement.accessToken,
          replacementSession.sessionId,
        ).pipe(
          Effect.asVoid,
          Effect.catchTag("EnvironmentFailure", (error) =>
            Effect.logWarning("Could not revoke unused environment admin token").pipe(
              Effect.annotateLogs({ environmentId: row.environmentId, reason: error.message }),
            ),
          ),
        );
        const current = yield* environmentRepository.findEnvironment(row.environmentId);
        if (current === undefined) {
          return yield* new EnvironmentFailure({ message: "Environment not found", status: 404 });
        }
        return yield* secrets.decrypt(current.adminTokenEncrypted).pipe(
          Effect.catchTags({
            SecretEncryptionError: (error) =>
              Effect.fail(
                new DatabaseError({ operation: "environment", reason: "unknown", cause: error }),
              ),
          }),
        );
      }

      yield* Effect.logInfo("Rotated environment admin bearer token").pipe(
        Effect.annotateLogs({
          environmentId: row.environmentId,
          expiresAt: replacementSession.expiresAt,
        }),
      );
      yield* revokeClientSession(
        client,
        row.endpoint,
        replacement.accessToken,
        currentSession.sessionId,
      ).pipe(
        Effect.asVoid,
        Effect.catchTag("EnvironmentFailure", (error) =>
          Effect.logWarning("Could not revoke replaced environment admin token").pipe(
            Effect.annotateLogs({ environmentId: row.environmentId, reason: error.message }),
          ),
        ),
      );
      return replacement.accessToken;
    });

    return yield* attempt.pipe(
      Effect.catchTag("EnvironmentFailure", (error) =>
        Effect.gen(function* () {
          const attemptedAt = DateTime.formatIso(yield* DateTime.now);
          yield* recordFailure(row, { _tag: "Retrying", message: error.message }, attemptedAt);
          yield* Effect.logWarning("Environment admin token replacement failed").pipe(
            Effect.annotateLogs({
              environmentId: row.environmentId,
              reason: error.message,
            }),
          );
          return token;
        }),
      ),
    );
  });

  const ensureFresh = (environmentId: string) => {
    let lock = locks.get(environmentId);
    if (lock === undefined) {
      lock = Semaphore.makeUnsafe(1);
      locks.set(environmentId, lock);
    }
    return lock.withPermit(maintain(environmentId));
  };

  const sweep = environmentRepository.listEnvironments.pipe(
    Effect.flatMap((rows) =>
      Effect.forEach(
        rows.filter((row) => row.enabled),
        (row) =>
          ensureFresh(row.environmentId).pipe(
            Effect.timeout(ADMIN_TOKEN_SWEEP_TIMEOUT),
            Effect.asVoid,
            Effect.catchTags({
              DatabaseError: (error) =>
                Effect.logError("Environment admin token sweep failed").pipe(
                  Effect.annotateLogs({ environmentId: row.environmentId, reason: error.message }),
                ),
              EnvironmentFailure: (error) =>
                Effect.logWarning("Environment admin token requires repair").pipe(
                  Effect.annotateLogs({ environmentId: row.environmentId, reason: error.message }),
                ),
              TimeoutError: () =>
                Effect.gen(function* () {
                  const attemptedAt = DateTime.formatIso(yield* DateTime.now);
                  yield* recordFailure(
                    row,
                    { _tag: "Retrying", message: "Admin token maintenance timed out" },
                    attemptedAt,
                  ).pipe(
                    Effect.catchTag("DatabaseError", (error) =>
                      Effect.logError("Could not record environment admin token timeout").pipe(
                        Effect.annotateLogs({
                          environmentId: row.environmentId,
                          reason: error.message,
                        }),
                      ),
                    ),
                  );
                  yield* Effect.logWarning("Environment admin token sweep timed out").pipe(
                    Effect.annotateLogs({ environmentId: row.environmentId }),
                  );
                }),
            }),
          ),
        { concurrency: ADMIN_TOKEN_SWEEP_CONCURRENCY, discard: true },
      ),
    ),
    Effect.catchTag("DatabaseError", (error) =>
      Effect.logError("Could not load environments for admin token sweep").pipe(
        Effect.annotateLogs({ reason: error.message }),
      ),
    ),
  );

  return AdminTokenRotation.of({ ensureFresh, sweep });
});

export const AdminTokenRotationLive = Layer.effect(AdminTokenRotation, makeAdminTokenRotation());
