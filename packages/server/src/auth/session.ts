import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Hex from "effect/encoding/Hex";

export const createSessionToken = Effect.gen(function* () {
  const random = yield* SecureRandom.SecureRandom;
  const bytes = yield* random.randomBytes(32);
  return Hex.encode(bytes);
});

export const hashSessionToken = (token: string) =>
  Effect.gen(function* () {
    const digests = yield* Digest.Digest;
    const digest = yield* digests.digest(Digest.sha256, new TextEncoder().encode(token));
    return Hex.encode(digest);
  });
