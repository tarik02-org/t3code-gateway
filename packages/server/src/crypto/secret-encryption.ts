import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { GatewayRuntimeConfig } from "../config.ts";
import { GatewayCrypto } from "./gateway-crypto.ts";

const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const SecretEncryptionOperation = Schema.Literals(["loadKey", "encrypt", "decrypt"]);
const SecretEncryptionFailureReason = Schema.Literals([
  "cipherFailed",
  "invalidKeyLength",
  "missingKeyFile",
  "payloadTooShort",
  "readKeyFile",
]);

export class SecretEncryption extends Context.Service<
  SecretEncryption,
  {
    readonly encrypt: (plaintext: string) => Effect.Effect<Buffer, SecretEncryptionError>;
    readonly decrypt: (ciphertext: Buffer) => Effect.Effect<string, SecretEncryptionError>;
  }
>()("@t3code-gateway/server/crypto/secret-encryption/SecretEncryption") {}

export class SecretEncryptionError extends Schema.TaggedError<SecretEncryptionError>()(
  "SecretEncryptionError",
  {
    operation: SecretEncryptionOperation,
    reason: SecretEncryptionFailureReason,
    path: Schema.optionalKey(Schema.String),
    expectedBytes: Schema.optionalKey(Schema.Number),
    actualBytes: Schema.optionalKey(Schema.Number),
    cause: Schema.optionalKey(Schema.Unknown),
  },
) {
  override get message() {
    if (this.reason === "missingKeyFile") {
      return "T3_GATEWAY_SECRET_KEY_FILE is required for token encryption";
    }
    if (this.reason === "invalidKeyLength") {
      return `Secret key file must contain exactly ${this.expectedBytes} bytes, got ${this.actualBytes}`;
    }
    if (this.reason === "readKeyFile") {
      return "Failed to read secret key file";
    }
    if (this.reason === "payloadTooShort") {
      return "Encrypted payload is too short";
    }
    if (this.operation === "decrypt") {
      return "Decryption failed";
    }
    return "Encryption failed";
  }
}

const loadMasterKey = Effect.gen(function* () {
  const config = yield* GatewayRuntimeConfig;
  const keyFile = Option.getOrUndefined(config.secretKeyFile);
  if (keyFile === undefined) {
    return yield* new SecretEncryptionError({ operation: "loadKey", reason: "missingKeyFile" });
  }

  const fs = yield* FileSystem.FileSystem;
  const keyBytes = yield* fs.readFile(keyFile).pipe(
    Effect.catchTags({
      PlatformError: (error) =>
        Effect.fail(
          new SecretEncryptionError({
            operation: "loadKey",
            reason: "readKeyFile",
            path: keyFile,
            cause: error,
          }),
        ),
    }),
  );

  if (keyBytes.length !== KEY_LENGTH) {
    return yield* new SecretEncryptionError({
      operation: "loadKey",
      reason: "invalidKeyLength",
      path: keyFile,
      expectedBytes: KEY_LENGTH,
      actualBytes: keyBytes.length,
    });
  }

  return Buffer.from(keyBytes);
});

export const layer = Layer.effect(
  SecretEncryption,
  Effect.gen(function* () {
    const key = yield* loadMasterKey;
    const crypto = yield* GatewayCrypto;
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();

    return SecretEncryption.of({
      encrypt: (plaintext) =>
        Effect.gen(function* () {
          const nonce = yield* crypto.randomBytes(NONCE_LENGTH);
          const ciphertextWithTag = yield* crypto.aes256GcmEncrypt({
            key,
            nonce,
            plaintext: textEncoder.encode(plaintext),
          });
          return Buffer.concat([Buffer.from(nonce), Buffer.from(ciphertextWithTag)]);
        }).pipe(
          Effect.catchTags({
            GatewayCryptoError: (error) =>
              Effect.fail(
                new SecretEncryptionError({
                  operation: "encrypt",
                  reason: "cipherFailed",
                  cause: error,
                }),
              ),
          }),
        ),
      decrypt: (ciphertext) =>
        Effect.gen(function* () {
          if (ciphertext.length < NONCE_LENGTH + AUTH_TAG_LENGTH) {
            return yield* new SecretEncryptionError({
              operation: "decrypt",
              reason: "payloadTooShort",
              actualBytes: ciphertext.length,
            });
          }

          const nonce = ciphertext.subarray(0, NONCE_LENGTH);
          const ciphertextWithTag = ciphertext.subarray(NONCE_LENGTH);
          const plaintext = yield* crypto
            .aes256GcmDecrypt({
              key,
              nonce,
              ciphertextWithTag,
            })
            .pipe(
              Effect.catchTags({
                GatewayCryptoError: (error) =>
                  Effect.fail(
                    new SecretEncryptionError({
                      operation: "decrypt",
                      reason: "cipherFailed",
                      cause: error,
                    }),
                  ),
              }),
            );
          return textDecoder.decode(plaintext);
        }),
    });
  }),
);
