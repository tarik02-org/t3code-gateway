import { eq } from "drizzle-orm";
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

const CHANNEL_KEY = "t3code.web.channel";
const AUTO_UPDATE_KEY = "t3code.web.autoUpdate";

const StoredGatewaySetting = Schema.Struct({
  key: Schema.String,
  value: Schema.String,
  updatedAt: Schema.String,
});

const StoredGatewaySettings = Schema.Array(StoredGatewaySetting);
const StoredAutoUpdate = Schema.Literals(["true", "false"]);

export type GatewaySettings = {
  readonly channel: T3CodeWebChannelType;
  readonly autoUpdate: boolean;
  readonly updatedAt: string;
};

const invalidSettings = () =>
  Effect.fail(new DatabaseError({ operation: "settings", reason: "invalidData" }));

const decodeGatewaySettings = (rows: unknown): Effect.Effect<GatewaySettings, DatabaseError> =>
  Schema.decodeUnknownEffect(StoredGatewaySettings)(rows).pipe(
    Effect.flatMap((settings) => {
      const channel = settings.find((setting) => setting.key === CHANNEL_KEY);
      const autoUpdate = settings.find((setting) => setting.key === AUTO_UPDATE_KEY);
      if (channel === undefined || autoUpdate === undefined) {
        return invalidSettings();
      }
      return Schema.decodeUnknownEffect(
        Schema.Struct({ channel: T3CodeWebChannel, autoUpdate: StoredAutoUpdate }),
      )({ channel: channel.value, autoUpdate: autoUpdate.value }).pipe(
        Effect.map((decoded) => ({
          channel: decoded.channel,
          autoUpdate: decoded.autoUpdate === "true",
          updatedAt:
            channel.updatedAt > autoUpdate.updatedAt ? channel.updatedAt : autoUpdate.updatedAt,
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
      input: Partial<Pick<GatewaySettings, "channel" | "autoUpdate">> & {
        readonly updatedAt: string;
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

  const updateKey = (key: string, value: string, updatedAt: string) =>
    db
      .update(gatewaySettings)
      .set({ value, updatedAt })
      .where(eq(gatewaySettings.key, key))
      .run()
      .pipe(
        Effect.asVoid,
        Effect.catchTags({
          EffectDrizzleQueryError: (error) => queryError("settings", error),
        }),
      );

  const update = (
    input: Partial<Pick<GatewaySettings, "channel" | "autoUpdate">> & {
      readonly updatedAt: string;
    },
  ) =>
    Effect.gen(function* () {
      if (input.channel !== undefined) {
        yield* updateKey(CHANNEL_KEY, input.channel, input.updatedAt);
      }
      if (input.autoUpdate !== undefined) {
        yield* updateKey(AUTO_UPDATE_KEY, String(input.autoUpdate), input.updatedAt);
      }
      return yield* read;
    });

  return SettingsRepository.of({ get: read, update });
});

export const SettingsRepositoryLive = Layer.effect(SettingsRepository, make);
