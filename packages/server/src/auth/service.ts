import { AuthFailure } from "@t3code-gateway/contracts/schemas";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Hex from "effect/encoding/Hex";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { GatewayCrypto } from "../crypto/gateway-crypto.ts";
import { AuthRepository } from "../db/auth-repository.ts";
import { DatabaseError } from "../db/errors.ts";
import { DEFAULT_ADMIN_USERNAME, SESSION_TTL_MS } from "./constants.ts";
import { hashPassword, verifyPassword } from "./password.ts";

export interface AuthenticatedUser {
  readonly id: string;
  readonly username: string;
}

export interface LoginResult {
  readonly user: AuthenticatedUser;
  readonly sessionToken: string;
}

export class AuthService extends Context.Service<
  AuthService,
  {
    readonly bootstrapFirstUser: () => Effect.Effect<void, DatabaseError>;
    readonly login: (
      username: string,
      password: string,
    ) => Effect.Effect<LoginResult, AuthFailure | DatabaseError>;
    readonly logout: (sessionToken: string | undefined) => Effect.Effect<void, DatabaseError>;
    readonly currentUser: (
      sessionToken: string | undefined,
    ) => Effect.Effect<AuthenticatedUser | null, DatabaseError>;
    readonly changePassword: (
      sessionToken: string | undefined,
      currentPassword: string,
      nextPassword: string,
    ) => Effect.Effect<void, AuthFailure | DatabaseError>;
  }
>()("@t3code-gateway/server/auth/service/AuthService") {}

const toAuthenticatedUser = (row: { id: string; username: string }): AuthenticatedUser => ({
  id: row.id,
  username: row.username,
});

const makeAuthService = Effect.gen(function* () {
  const authRepository = yield* AuthRepository;
  const random = yield* SecureRandom.SecureRandom;
  const digests = yield* Digest.Digest;
  const gatewayCrypto = yield* GatewayCrypto;

  const bootstrapFirstUser = () =>
    Effect.gen(function* () {
      const existing = yield* authRepository.countUsers;
      if (existing > 0) {
        return;
      }

      const userId = yield* random.uuidV4();
      const generatedPassword = Base64Url.encode(yield* random.randomBytes(24));
      const passwordHash = yield* hashPassword(gatewayCrypto, generatedPassword);
      const timestamp = DateTime.formatIso(DateTime.nowUnsafe());

      yield* authRepository.createUser({
        id: userId,
        username: DEFAULT_ADMIN_USERNAME,
        passwordHash,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      yield* Console.log(
        `Created initial gateway user "${DEFAULT_ADMIN_USERNAME}" with generated password: ${generatedPassword}`,
      );
    }).pipe(
      Effect.catchTags({
        GatewayCryptoError: (error) =>
          Effect.fail(
            new DatabaseError({ operation: "authUser", reason: "unknown", cause: error }),
          ),
      }),
    );

  const hashSessionTokenLocal = (token: string) =>
    Effect.gen(function* () {
      const digest = yield* digests.digest(Digest.sha256, new TextEncoder().encode(token));
      return Hex.encode(digest);
    });

  const createSessionTokenLocal = () =>
    Effect.gen(function* () {
      const bytes = yield* random.randomBytes(32);
      return Hex.encode(bytes);
    });
  const createSession = (userId: string) =>
    Effect.gen(function* () {
      const sessionId = yield* random.uuidV4();
      const sessionToken = yield* createSessionTokenLocal();
      const sessionTokenHash = yield* hashSessionTokenLocal(sessionToken);
      const expiresAt = DateTime.formatIso(
        DateTime.add(DateTime.nowUnsafe(), { milliseconds: SESSION_TTL_MS }),
      );
      const createdAt = DateTime.formatIso(DateTime.nowUnsafe());

      yield* authRepository.createSession({
        id: sessionId,
        userId,
        sessionTokenHash,
        expiresAt,
        createdAt,
      });

      return sessionToken;
    });

  const resolveSession = (sessionToken: string | undefined) =>
    Effect.gen(function* () {
      if (sessionToken === undefined || sessionToken.length === 0) {
        return null;
      }

      const sessionTokenHash = yield* hashSessionTokenLocal(sessionToken);
      const row = yield* authRepository.findSessionUserByTokenHash(sessionTokenHash);

      if (row === undefined) {
        return null;
      }

      const expiresAt = Option.getOrNull(DateTime.make(row.expiresAt));
      if (expiresAt === null || DateTime.isPastUnsafe(expiresAt)) {
        yield* authRepository.deleteSessionById(row.sessionId);
        return null;
      }

      return toAuthenticatedUser(row);
    });

  const login = (username: string, password: string) =>
    Effect.gen(function* () {
      const row = yield* authRepository.findUserByUsername(username);

      if (row === undefined) {
        return yield* new AuthFailure({ message: "Invalid username or password" });
      }

      const valid = yield* verifyPassword(gatewayCrypto, password, row.passwordHash);
      if (!valid) {
        return yield* new AuthFailure({ message: "Invalid username or password" });
      }

      const sessionToken = yield* createSession(row.id);
      return {
        user: toAuthenticatedUser(row),
        sessionToken,
      };
    }).pipe(
      Effect.catchTags({
        GatewayCryptoError: (error) => Effect.fail(new AuthFailure({ message: error.message })),
      }),
    );

  const logout = (sessionToken: string | undefined) =>
    Effect.gen(function* () {
      if (sessionToken === undefined || sessionToken.length === 0) {
        return;
      }

      const sessionTokenHash = yield* hashSessionTokenLocal(sessionToken);
      yield* authRepository.deleteSessionByTokenHash(sessionTokenHash);
    });

  const currentUser = (sessionToken: string | undefined) => resolveSession(sessionToken);

  const changePassword = (
    sessionToken: string | undefined,
    currentPassword: string,
    nextPassword: string,
  ) =>
    Effect.gen(function* () {
      const user = yield* resolveSession(sessionToken);
      if (user === null) {
        return yield* new AuthFailure({ message: "Authentication required" });
      }

      const row = yield* authRepository.findUserPasswordById(user.id);

      if (row === undefined) {
        return yield* new AuthFailure({ message: "Authentication required" });
      }

      const valid = yield* verifyPassword(gatewayCrypto, currentPassword, row.passwordHash);
      if (!valid) {
        return yield* new AuthFailure({ message: "Current password is incorrect" });
      }

      const passwordHash = yield* hashPassword(gatewayCrypto, nextPassword);
      const timestamp = DateTime.formatIso(DateTime.nowUnsafe());
      const sessionTokenHash =
        sessionToken !== undefined && sessionToken.length > 0
          ? yield* hashSessionTokenLocal(sessionToken)
          : null;

      yield* authRepository.updateUserPassword(user.id, passwordHash, timestamp);

      if (sessionTokenHash !== null) {
        const currentSessionId = yield* authRepository.findSessionIdByTokenHash(sessionTokenHash);

        if (currentSessionId !== undefined) {
          yield* authRepository.deleteOtherUserSessions(user.id, currentSessionId);
        }
      }
    }).pipe(
      Effect.catchTags({
        GatewayCryptoError: (error) => Effect.fail(new AuthFailure({ message: error.message })),
      }),
    );

  return AuthService.of({
    bootstrapFirstUser,
    login,
    logout,
    currentUser,
    changePassword,
  });
});

export const layer = Layer.effect(AuthService, makeAuthService);
