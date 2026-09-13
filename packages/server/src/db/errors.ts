import { EffectDrizzleQueryError, MigratorInitError } from "drizzle-orm/effect-core/errors";
import * as Effect from "effect/Effect";
import type * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import type { SqlError } from "effect/unstable/sql/SqlError";

const DatabaseOperation = Schema.Literals([
  "ensureDirectory",
  "migrate",
  "bootstrapUser",
  "authSession",
  "authUser",
  "environment",
  "settings",
]);

type DatabaseOperation = typeof DatabaseOperation.Type;

const DatabaseFailureReason = Schema.Literals([
  "alreadyExists",
  "badArgument",
  "busy",
  "connection",
  "constraint",
  "invalidData",
  "migrationInit",
  "notFound",
  "permissionDenied",
  "query",
  "timeout",
  "unknown",
]);

type DatabaseFailureReason = typeof DatabaseFailureReason.Type;

const databaseMessage = (operation: DatabaseOperation, reason: DatabaseFailureReason) => {
  if (operation === "ensureDirectory") {
    return `Database directory setup failed: ${reason}`;
  }
  if (operation === "migrate") {
    return `Database migration failed: ${reason}`;
  }
  return `Database ${operation} operation failed: ${reason}`;
};

export class DatabaseError extends Schema.TaggedErrorClass<DatabaseError>()("DatabaseError", {
  operation: DatabaseOperation,
  reason: DatabaseFailureReason,
  path: Schema.optionalKey(Schema.String),
  cause: Schema.optionalKey(Schema.Unknown),
}) {
  override get message() {
    return databaseMessage(this.operation, this.reason);
  }
}

export const reasonFromPlatformError = (
  error: PlatformError.PlatformError,
): DatabaseFailureReason => {
  const tag = error.reason["_tag"];
  if (tag === "AlreadyExists") {
    return "alreadyExists";
  }
  if (tag === "BadArgument") {
    return "badArgument";
  }
  if (tag === "BadResource") {
    return "badArgument";
  }
  if (tag === "Busy") {
    return "busy";
  }
  if (tag === "InvalidData") {
    return "invalidData";
  }
  if (tag === "NotFound") {
    return "notFound";
  }
  if (tag === "PermissionDenied") {
    return "permissionDenied";
  }
  if (tag === "TimedOut") {
    return "timeout";
  }
  return "unknown";
};

const reasonFromSqlError = (error: SqlError): DatabaseFailureReason => {
  const tag = error.reason["_tag"];
  if (tag === "ConnectionError") {
    return "connection";
  }
  if (tag === "ConstraintError" || tag === "UniqueViolation") {
    return "constraint";
  }
  if (tag === "LockTimeoutError" || tag === "StatementTimeoutError") {
    return "timeout";
  }
  return "query";
};

export const queryError = (operation: DatabaseOperation, error: EffectDrizzleQueryError) =>
  Effect.fail(
    new DatabaseError({
      operation,
      reason: "query",
      cause: error,
    }),
  );

export const migrationError = {
  EffectDrizzleQueryError: (error: EffectDrizzleQueryError) =>
    Effect.fail(
      new DatabaseError({
        operation: "migrate",
        reason: "query",
        cause: error,
      }),
    ),
  MigratorInitError: (error: MigratorInitError) =>
    Effect.fail(
      new DatabaseError({
        operation: "migrate",
        reason: "migrationInit",
        cause: error,
      }),
    ),
  SqlError: (error: SqlError) =>
    Effect.fail(
      new DatabaseError({
        operation: "migrate",
        reason: reasonFromSqlError(error),
        cause: error,
      }),
    ),
};
