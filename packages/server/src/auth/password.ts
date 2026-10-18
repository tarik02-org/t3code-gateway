import * as Effect from "effect/Effect";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Result from "effect/Result";

import { GatewayCrypto } from "../crypto/gateway-crypto.ts";

const keyLength = 64;
const saltLength = 16;

const scryptOptions = {
  N: 16_384,
  r: 8,
  p: 1,
  dkLen: keyLength,
  maxmem: 64 * 1024 * 1024,
} as const;

export const hashPassword = (crypto: GatewayCrypto["Service"], password: string) =>
  Effect.gen(function* () {
    const salt = yield* crypto.randomBytes(saltLength);
    const key = yield* crypto.scrypt({
      password,
      salt,
      keyLength,
      ...scryptOptions,
    });

    return `scrypt:${Base64Url.encode(salt)}:${Base64Url.encode(key)}`;
  });

export const verifyPassword = (
  crypto: GatewayCrypto["Service"],
  password: string,
  passwordHash: string,
) =>
  Effect.gen(function* () {
    const [algorithm = "", encodedSalt = "", encodedKey = ""] = passwordHash.split(":");
    if (algorithm !== "scrypt" || encodedSalt.length === 0 || encodedKey.length === 0) {
      return false;
    }

    const decodedSalt = Base64Url.decode(encodedSalt);
    const decodedKey = Base64Url.decode(encodedKey);
    if (Result.isFailure(decodedSalt) || Result.isFailure(decodedKey)) {
      return false;
    }

    const salt = decodedSalt.success;
    const expectedKey = decodedKey.success;
    const key = yield* crypto.scrypt({
      password,
      salt,
      keyLength,
      ...scryptOptions,
    });

    return yield* crypto.timingSafeEqual(key, expectedKey);
  });
