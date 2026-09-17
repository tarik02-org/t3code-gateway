import { sql } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import {
  T3CodeWebChannel,
  type T3CodeWebChannel as T3CodeWebChannelType,
} from "@t3code-gateway/contracts/schemas";

import { GatewayDatabase } from "./database.ts";
import { DatabaseError, queryError } from "./errors.ts";
import { gatewaySettings } from "./schema.ts";

const UPDATE_CHANNEL_KEY = "t3code.web.updateChannel";
const AUTO_UPDATE_KEY = "t3code.web.autoUpdate";
const AUTO_GC_KEY = "t3code.web.autoGc";
const PINNED_VERSION_KEYS = {
  stable: "t3code.web.pinned.stable",
  nightly: "t3code.web.pinned.nightly",
} as const;
const GITHUB_TOKEN_KEY = "t3code.web.githubToken";
// Stored as base64 AES-256-GCM ciphertext (see SecretEncryption) or "" when unset.
const KEEP_RECENT_KEYS = {
  stable: "t3code.web.keepRecent.stable",
  nightly: "t3code.web.keepRecent.nightly",
} as const;

const StoredGatewaySetting = Schema.Struct({
  key: Schema.String,
  value: Schema.String,
  updatedAt: Schema.String,
});

const StoredGatewaySettings = Schema.Array(StoredGatewaySetting);
const StoredAutoUpdate = Schema.Literals(["true", "false"]);

export type GatewaySettings = {
  readonly updateChannel: T3CodeWebChannelType;
  readonly autoUpdate: boolean;
  readonly autoGc: boolean;
  readonly keepRecent: {
    readonly stable: number;
    readonly nightly: number;
  };
  readonly pinnedVersions: {
    readonly stable: string | null;
    readonly nightly: string | null;
  };
  readonly githubToken: string | null;
  readonly updatedAt: string;
};

const invalidSettings = () =>
  Effect.fail(new DatabaseError({ operation: "settings", reason: "invalidData" }));

const decodeGatewaySettings = (rows: unknown): Effect.Effect<GatewaySettings, DatabaseError> =>
  Schema.decodeUnknownEffect(StoredGatewaySettings)(rows).pipe(
    Effect.flatMap((settings) => {
      const updateChannel = settings.find((setting) => setting.key === UPDATE_CHANNEL_KEY);
      const autoUpdate = settings.find((setting) => setting.key === AUTO_UPDATE_KEY);
      const autoGc = settings.find((setting) => setting.key === AUTO_GC_KEY);
      const stablePin = settings.find((setting) => setting.key === PINNED_VERSION_KEYS.stable);
      const nightlyPin = settings.find((setting) => setting.key === PINNED_VERSION_KEYS.nightly);
      const stableKeepRecent = settings.find((setting) => setting.key === KEEP_RECENT_KEYS.stable);
      const nightlyKeepRecent = settings.find(
        (setting) => setting.key === KEEP_RECENT_KEYS.nightly,
      );
      const githubToken = settings.find((setting) => setting.key === GITHUB_TOKEN_KEY);
      if (
        updateChannel === undefined ||
        autoUpdate === undefined ||
        autoGc === undefined ||
        stablePin === undefined ||
        nightlyPin === undefined ||
        stableKeepRecent === undefined ||
        nightlyKeepRecent === undefined
      ) {
        return invalidSettings();
      }
      return Schema.decodeUnknownEffect(
        Schema.Struct({
          channel: T3CodeWebChannel,
          autoUpdate: StoredAutoUpdate,
          autoGc: StoredAutoUpdate,
          stableKeepRecent: Schema.NumberFromString,
          nightlyKeepRecent: Schema.NumberFromString,
        }),
      )({
        channel: updateChannel.value,
        autoUpdate: autoUpdate.value,
        autoGc: autoGc.value,
        stableKeepRecent: stableKeepRecent.value,
        nightlyKeepRecent: nightlyKeepRecent.value,
      }).pipe(
        Effect.flatMap((decoded) =>
          decoded.stableKeepRecent >= 0 &&
          Number.isInteger(decoded.stableKeepRecent) &&
          decoded.nightlyKeepRecent >= 0 &&
          Number.isInteger(decoded.nightlyKeepRecent)
            ? Effect.succeed(decoded)
            : invalidSettings(),
        ),
        Effect.map((decoded) => ({
          updateChannel: decoded.channel,
          autoUpdate: decoded.autoUpdate === "true",
          autoGc: decoded.autoGc === "true",
          keepRecent: {
            stable: decoded.stableKeepRecent,
            nightly: decoded.nightlyKeepRecent,
          },
          pinnedVersions: {
            stable: stablePin.value === "" ? null : stablePin.value,
            nightly: nightlyPin.value === "" ? null : nightlyPin.value,
          },
          githubToken:
            githubToken === undefined || githubToken.value === "" ? null : githubToken.value,
          updatedAt:
            updateChannel.updatedAt > autoUpdate.updatedAt
              ? updateChannel.updatedAt
              : autoUpdate.updatedAt,
        })),
        Effect.catchTag("SchemaError", () => invalidSettings()),
      );
    }),
    Effect.catchTag("SchemaError", () => invalidSettings()),
  );

export class SettingsRepository extends Context.Service<
  SettingsRepository,
  {
    readonly get: Effect.Effect<GatewaySettings, DatabaseError>;
    readonly update: (
      input: Partial<Pick<GatewaySettings, "updateChannel" | "autoUpdate" | "autoGc">> & {
        readonly updatedAt: string;
        readonly pinnedVersions?: Partial<GatewaySettings["pinnedVersions"]>;
        readonly keepRecent?: Partial<GatewaySettings["keepRecent"]>;
        readonly githubToken?: string | null;
      },
    ) => Effect.Effect<GatewaySettings, DatabaseError>;
  }
>()("@t3code-gateway/server/db/settings-repository/SettingsRepository") {}

export const make = Effect.gen(function* () {
  const { db } = yield* GatewayDatabase;

  const read = db
    .select()
    .from(gatewaySettings)
    .all()
    .pipe(
      Effect.flatMap(decodeGatewaySettings),
      Effect.catchTags({
        EffectDrizzleQueryError: (error) => queryError("settings", error),
      }),
    );

  const update = (
    input: Partial<Pick<GatewaySettings, "updateChannel" | "autoUpdate" | "autoGc">> & {
      readonly updatedAt: string;
      readonly pinnedVersions?: Partial<GatewaySettings["pinnedVersions"]>;
      readonly keepRecent?: Partial<GatewaySettings["keepRecent"]>;
      readonly githubToken?: string | null;
    },
  ) =>
    Effect.gen(function* () {
      const values = [
        ...(input.updateChannel === undefined
          ? []
          : [
              {
                key: UPDATE_CHANNEL_KEY,
                value: input.updateChannel,
                updatedAt: input.updatedAt,
              },
            ]),
        ...(input.autoUpdate === undefined
          ? []
          : [
              { key: AUTO_UPDATE_KEY, value: String(input.autoUpdate), updatedAt: input.updatedAt },
            ]),
        ...(input.autoGc === undefined
          ? []
          : [{ key: AUTO_GC_KEY, value: String(input.autoGc), updatedAt: input.updatedAt }]),
        ...(input.pinnedVersions?.stable === undefined
          ? []
          : [
              {
                key: PINNED_VERSION_KEYS.stable,
                value: input.pinnedVersions.stable ?? "",
                updatedAt: input.updatedAt,
              },
            ]),
        ...(input.pinnedVersions?.nightly === undefined
          ? []
          : [
              {
                key: PINNED_VERSION_KEYS.nightly,
                value: input.pinnedVersions.nightly ?? "",
                updatedAt: input.updatedAt,
              },
            ]),
        ...(input.keepRecent?.stable === undefined
          ? []
          : [
              {
                key: KEEP_RECENT_KEYS.stable,
                value: String(input.keepRecent.stable),
                updatedAt: input.updatedAt,
              },
            ]),
        ...(input.keepRecent?.nightly === undefined
          ? []
          : [
              {
                key: KEEP_RECENT_KEYS.nightly,
                value: String(input.keepRecent.nightly),
                updatedAt: input.updatedAt,
              },
            ]),
        ...(input.githubToken === undefined
          ? []
          : [
              {
                key: GITHUB_TOKEN_KEY,
                value: input.githubToken ?? "",
                updatedAt: input.updatedAt,
              },
            ]),
      ];
      if (values.length > 0) {
        yield* db
          .insert(gatewaySettings)
          .values(values)
          .onConflictDoUpdate({
            target: gatewaySettings.key,
            set: {
              value: sql`excluded.value`,
              updatedAt: input.updatedAt,
            },
          })
          .run()
          .pipe(
            Effect.asVoid,
            Effect.catchTags({
              EffectDrizzleQueryError: (error) => queryError("settings", error),
            }),
          );
      }
      return yield* read;
    });

  return SettingsRepository.of({ get: read, update });
});

export const SettingsRepositoryLive = Layer.effect(SettingsRepository, make);
