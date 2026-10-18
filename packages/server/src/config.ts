import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import { upstreamRepository } from "./t3code-web/release-archive.ts";

export const GatewayConfig = Config.all({
  databasePath: Config.String("T3_GATEWAY_DATABASE_PATH").pipe(
    Config.withDefault("/var/lib/t3code-gateway/gateway.sqlite"),
  ),
  listenHost: Config.String("T3_GATEWAY_LISTEN_HOST").pipe(Config.withDefault("0.0.0.0")),
  listenPort: Config.Port("T3_GATEWAY_LISTEN_PORT").pipe(Config.withDefault(8787)),
  publicBaseDomain: Config.String("T3_GATEWAY_PUBLIC_BASE_DOMAIN").pipe(
    Config.withDefault("localhost"),
  ),
  secretKeyFile: Config.String("T3_GATEWAY_SECRET_KEY_FILE").pipe(Config.option),
  traefikDynamicFile: Config.String("T3_GATEWAY_TRAEFIK_DYNAMIC_FILE").pipe(Config.option),
  traefikEntrypoint: Config.String("T3_GATEWAY_TRAEFIK_ENTRYPOINT").pipe(
    Config.withDefault("websecure"),
  ),
  traefikTlsEnabled: Config.Boolean("T3_GATEWAY_TRAEFIK_TLS_ENABLED").pipe(
    Config.withDefault(true),
  ),
  traefikCertResolver: Config.String("T3_GATEWAY_TRAEFIK_CERT_RESOLVER").pipe(
    Config.withDefault(""),
  ),
  traefikAuthMiddlewares: Config.String("T3_GATEWAY_TRAEFIK_AUTH_MIDDLEWARES").pipe(
    Config.withDefault(""),
  ),
  adminStaticRoot: Config.String("T3_GATEWAY_ADMIN_STATIC_ROOT").pipe(Config.option),
  t3codeWebEnabled: Config.Boolean("T3_GATEWAY_T3CODE_WEB_ENABLED").pipe(Config.withDefault(true)),
  t3codeWebStaticRoot: Config.String("T3_GATEWAY_T3CODE_WEB_STATIC_ROOT").pipe(Config.option),
  t3codeWebBundledRoot: Config.String("T3_GATEWAY_T3CODE_WEB_BUNDLED_ROOT").pipe(Config.option),
  t3codeWebDataRoot: Config.String("T3_GATEWAY_T3CODE_WEB_DATA_ROOT").pipe(
    Config.withDefault("/data/t3code-web"),
  ),
  t3codeWebRepository: Config.String("T3_GATEWAY_T3CODE_WEB_REPOSITORY").pipe(
    Config.withDefault(upstreamRepository),
  ),
  githubToken: Config.Redacted("T3_GATEWAY_GITHUB_TOKEN").pipe(Config.option),
  /** Pins the origin OAuth and MCP advertise, for proxies that misreport `X-Forwarded-Proto`. */
  publicUrl: Config.URL("T3_GATEWAY_PUBLIC_URL").pipe(Config.option),
});

export type GatewayConfig = Config.Success<typeof GatewayConfig>;

export class GatewayRuntimeConfig extends Context.Service<GatewayRuntimeConfig, GatewayConfig>()(
  "@t3code-gateway/server/config/GatewayRuntimeConfig",
) {}

export const configLayer = Layer.effect(GatewayRuntimeConfig, GatewayConfig);
