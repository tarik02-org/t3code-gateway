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
const PINNED_VERSION_KEYS = {
  stable: "t3code.web.pinned.stable",
  nightly: "t3code.web.pinned.nightly",
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
  readonly pinnedVersions: {
    readonly stable: string | null;
    readonly nightly: string | null;
  };
  readonly updatedAt: string;
};

const invalidSettings = () =>
  Effect.fail(new DatabaseError({ operation: "settings", reason: "invalidData" }));

const decodeGatewaySettings = (rows: unknown): Effect.Effect<GatewaySettings, DatabaseError> =>
  Schema.decodeUnknownEffect(StoredGatewaySettings)(rows).pipe(
    Effect.flatMap((settings) => {
      const updateChannel = settings.find((setting) => setting.key === UPDATE_CHANNEL_KEY);
      const autoUpdate = settings.find((setting) => setting.key === AUTO_UPDATE_KEY);
      const stablePin = settings.find((setting) => setting.key === PINNED_VERSION_KEYS.stable);
      const nightlyPin = settings.find((setting) => setting.key === PINNED_VERSION_KEYS.nightly);
      if (
        updateChannel === undefined ||
        autoUpdate === undefined ||
        stablePin === undefined ||
        nightlyPin === undefined
      ) {
        return invalidSettings();
      }
      return Schema.decodeUnknownEffect(
        Schema.Struct({ channel: T3CodeWebChannel, autoUpdate: StoredAutoUpdate }),
      )({ channel: updateChannel.value, autoUpdate: autoUpdate.value }).pipe(
        Effect.map((decoded) => ({
          updateChannel: decoded.channel,
          autoUpdate: decoded.autoUpdate === "true",
          pinnedVersions: {
            stable: stablePin.value === "" ? null : stablePin.value,
            nightly: nightlyPin.value === "" ? null : nightlyPin.value,
          },
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
      input: Partial<Pick<GatewaySettings, "updateChannel" | "autoUpdate">> & {
        readonly updatedAt: string;
        readonly pinnedVersions?: Partial<GatewaySettings["pinnedVersions"]>;
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
    input: Partial<Pick<GatewaySettings, "updateChannel" | "autoUpdate">> & {
      readonly updatedAt: string;
      readonly pinnedVersions?: Partial<GatewaySettings["pinnedVersions"]>;
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
