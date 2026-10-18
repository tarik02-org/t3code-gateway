import * as Schema from "effect/Schema";

const StringArrayFromJsonString = Schema.fromJsonString(Schema.Array(Schema.String));
const UnknownFromJsonString = Schema.fromJsonString(Schema.Unknown);

export const encodeStringArrayJson = (values: ReadonlyArray<string>) =>
  Schema.encodeSync(StringArrayFromJsonString)(values);

export const decodeStringArrayJson = (json: string) =>
  Schema.decodeSync(StringArrayFromJsonString)(json);

export const encodeUnknownJson = (value: unknown) =>
  Schema.encodeSync(UnknownFromJsonString)(value);

export const decodeUnknownJson = (json: string) => Schema.decodeSync(UnknownFromJsonString)(json);
