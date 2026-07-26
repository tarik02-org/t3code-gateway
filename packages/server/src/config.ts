import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

export const GatewayConfig = Config.all({
  databasePath: Config.string("T3_GATEWAY_DATABASE_PATH").pipe(
    Config.withDefault("/var/lib/t3code-gateway/gateway.sqlite"),
  ),
  listenHost: Config.string("T3_GATEWAY_LISTEN_HOST").pipe(Config.withDefault("0.0.0.0")),
  listenPort: Config.port("T3_GATEWAY_LISTEN_PORT").pipe(Config.withDefault(8787)),
  publicBaseDomain: Config.string("T3_GATEWAY_PUBLIC_BASE_DOMAIN").pipe(
    Config.withDefault("localhost"),
  ),
  secretKeyFile: Config.string("T3_GATEWAY_SECRET_KEY_FILE").pipe(Config.option),
  traefikDynamicFile: Config.string("T3_GATEWAY_TRAEFIK_DYNAMIC_FILE").pipe(Config.option),
  traefikEntrypoint: Config.string("T3_GATEWAY_TRAEFIK_ENTRYPOINT").pipe(
    Config.withDefault("websecure"),
  ),
  traefikTlsEnabled: Config.boolean("T3_GATEWAY_TRAEFIK_TLS_ENABLED").pipe(
    Config.withDefault(true),
  ),
  traefikCertResolver: Config.string("T3_GATEWAY_TRAEFIK_CERT_RESOLVER").pipe(
    Config.withDefault(""),
  ),
  traefikAuthMiddlewares: Config.string("T3_GATEWAY_TRAEFIK_AUTH_MIDDLEWARES").pipe(
    Config.withDefault(""),
  ),
  adminStaticRoot: Config.string("T3_GATEWAY_ADMIN_STATIC_ROOT").pipe(Config.option),
  t3codeWebEnabled: Config.boolean("T3_GATEWAY_T3CODE_WEB_ENABLED").pipe(Config.withDefault(true)),
  t3codeWebStaticRoot: Config.string("T3_GATEWAY_T3CODE_WEB_STATIC_ROOT").pipe(Config.option),
  t3codeWebBuildId: Config.string("T3_GATEWAY_T3CODE_WEB_BUILD_ID").pipe(Config.option),
});

export type GatewayConfig = Config.Success<typeof GatewayConfig>;

export class GatewayRuntimeConfig extends Context.Service<GatewayRuntimeConfig, GatewayConfig>()(
  "@t3code-gateway/server/config/GatewayRuntimeConfig",
) {}

export const configLayer = Layer.effect(GatewayRuntimeConfig, GatewayConfig);
