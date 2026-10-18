import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const GatewayCryptoOperation = Schema.Literals([
  "aes256GcmDecrypt",
  "aes256GcmEncrypt",
  "randomBytes",
  "scrypt",
  "timingSafeEqual",
]);

export const GatewayCryptoFailureReason = Schema.Literals([
  "cipherFailed",
  "comparisonFailed",
  "derivationFailed",
  "randomFailed",
]);

export interface ScryptInput {
  readonly password: string;
  readonly salt: Uint8Array;
  readonly keyLength: number;
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly maxmem: number;
}

export interface Aes256GcmEncryptInput {
  readonly key: Uint8Array;
  readonly nonce: Uint8Array;
  readonly plaintext: Uint8Array;
}

export interface Aes256GcmDecryptInput {
  readonly key: Uint8Array;
  readonly nonce: Uint8Array;
  readonly ciphertextWithTag: Uint8Array;
}

export class GatewayCryptoError extends Schema.TaggedError<GatewayCryptoError>()(
  "GatewayCryptoError",
  {
    operation: GatewayCryptoOperation,
    reason: GatewayCryptoFailureReason,
    cause: Schema.optionalKey(Schema.Unknown),
  },
) {
  override get message() {
    return `Gateway crypto ${this.operation} failed: ${this.reason}`;
  }
}

export class GatewayCrypto extends Context.Service<
  GatewayCrypto,
  {
    readonly randomBytes: (length: number) => Effect.Effect<Uint8Array, GatewayCryptoError>;
    readonly scrypt: (input: ScryptInput) => Effect.Effect<Uint8Array, GatewayCryptoError>;
    readonly timingSafeEqual: (
      left: Uint8Array,
      right: Uint8Array,
    ) => Effect.Effect<boolean, GatewayCryptoError>;
    readonly aes256GcmEncrypt: (
      input: Aes256GcmEncryptInput,
    ) => Effect.Effect<Uint8Array, GatewayCryptoError>;
    readonly aes256GcmDecrypt: (
      input: Aes256GcmDecryptInput,
    ) => Effect.Effect<Uint8Array, GatewayCryptoError>;
  }
>()("@t3code-gateway/server/crypto/gateway-crypto/GatewayCrypto") {}
