import { eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { T3CodeWebChannel } from "@t3code-gateway/contracts/schemas";
import type { T3CodeWebChannel as T3CodeWebChannelType } from "@t3code-gateway/contracts/schemas";

import { GatewayDatabase } from "./database.ts";
import { DatabaseError, queryError } from "./errors.ts";
import { gatewaySettings } from "./schema.ts";

const StoredGatewaySettings = Schema.Struct({
  id: Schema.Number,
  t3codeWebChannel: T3CodeWebChannel,
  t3codeWebAutoUpdate: Schema.Boolean,
  updatedAt: Schema.String,
});

export type GatewaySettings = {
  readonly channel: T3CodeWebChannelType;
  readonly autoUpdate: boolean;
  readonly updatedAt: string;
};

const decodeGatewaySettings = (row: unknown) =>
  Schema.decodeUnknownEffect(StoredGatewaySettings)(row).pipe(
    Effect.map((settings) => ({
      channel: settings.t3codeWebChannel,
      autoUpdate: settings.t3codeWebAutoUpdate,
      updatedAt: settings.updatedAt,
    })),
    Effect.catchTag("SchemaError", () =>
      Effect.fail(new DatabaseError({ operation: "settings", reason: "invalidData" })),
    ),
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
    .where(eq(gatewaySettings.id, 1))
    .get()
    .pipe(
      Effect.flatMap((row) =>
        row === undefined
          ? Effect.fail(new DatabaseError({ operation: "settings", reason: "notFound" }))
          : decodeGatewaySettings(row),
      ),
      Effect.catchTags({
        EffectDrizzleQueryError: (error) => queryError("settings", error),
      }),
    );

  const update = (
    input: Partial<Pick<GatewaySettings, "channel" | "autoUpdate">> & {
      readonly updatedAt: string;
    },
  ) =>
    db
      .update(gatewaySettings)
      .set({
        ...(input.channel === undefined ? {} : { t3codeWebChannel: input.channel }),
        ...(input.autoUpdate === undefined ? {} : { t3codeWebAutoUpdate: input.autoUpdate }),
        updatedAt: input.updatedAt,
      })
      .where(eq(gatewaySettings.id, 1))
      .run()
      .pipe(
        Effect.flatMap(() => read),
        Effect.catchTags({
          EffectDrizzleQueryError: (error) => queryError("settings", error),
        }),
      );

  return SettingsRepository.of({ get: read, update });
});

export const SettingsRepositoryLive = Layer.effect(SettingsRepository, make);
