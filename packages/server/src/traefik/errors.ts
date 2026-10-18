import * as Schema from "effect/Schema";

export const TraefikWriteFailureReason = Schema.Literals([
  "alreadyExists",
  "badArgument",
  "busy",
  "invalidData",
  "notFound",
  "permissionDenied",
  "timeout",
  "unknown",
]);

export class TraefikWriteError extends Schema.TaggedError<TraefikWriteError>()(
  "TraefikWriteError",
  {
    reason: TraefikWriteFailureReason,
    path: Schema.String,
    cause: Schema.Unknown,
  },
) {
  override get message() {
    return `Failed to write Traefik dynamic config: ${this.reason}`;
  }
}
