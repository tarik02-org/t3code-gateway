import { McpAccess } from "@t3code-gateway/contracts/schemas";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { EnvironmentRepository, type EnvironmentRow } from "../db/environment-repository.ts";
import { joinBaseUrl } from "../environments/urls.ts";
import { GATEWAY_VERSION } from "../version.ts";
import type { McpCaller } from "./grants.ts";
import { McpUpstreamCredentials } from "./upstream-credentials.ts";

const ENVIRONMENT_ARGUMENT = "environment";
const MCP_ACCESS_LEVELS = McpAccess.literals;
const LIST_ENVIRONMENTS_TOOL = "gateway_list_environments";
const TOOL_CACHE_TTL_MS = 60_000;
// `t3_thread_wait` holds a call open for as long as the agent asks; the agent's own client bounds it.
const UPSTREAM_CALL_TIMEOUT_MS = 60 * 60 * 1_000;

/**
 * T3 Code tools that act for a calling thread. A relay client has none, so
 * T3 Code refuses every call; listing them would only invite failures.
 */
const callerThreadTools = new Set([
  "create_threads",
  "delegate_task",
  "request_secret",
  "task_cancel",
  "task_status",
  "t3_worktree_handoff",
  "t3_worktree_status",
]);
const callerThreadToolPrefixes = ["device_", "html_", "preview_", "t3_preview_"];

const isRelayedTool = (name: string) =>
  !callerThreadTools.has(name) &&
  !callerThreadToolPrefixes.some((prefix) => name.startsWith(prefix));

const INSTRUCTIONS = [
  "This server relays T3 Code environments through T3 Code Gateway.",
  `Every T3 Code tool takes an \`${ENVIRONMENT_ARGUMENT}\` argument naming the environment it runs in;`,
  `\`${LIST_ENVIRONMENTS_TOOL}\` lists the environments this connection reaches.`,
].join(" ");

/**
 * A JSON-RPC error for the relay client. The SDK server sends `code` and
 * `message` as they are; `McpError` would prefix its message a second time.
 */
class RelayRpcError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

/** Passes an environment's JSON-RPC error on without the prefix its `McpError` added. */
const fromUpstream = (error: McpError) =>
  new RelayRpcError(error.code, error.message.replace(/^MCP error -?\d+: /, ""), error.data);

export class McpRelayError extends Schema.TaggedErrorClass<McpRelayError>()("McpRelayError", {
  message: Schema.String,
}) {}

const relayError = (cause: unknown, fallback: string) =>
  new McpRelayError({ message: cause instanceof Error ? cause.message : fallback });

/** The message of an Effect failure, for an MCP reply. */
const failureMessage = (cause: Cause.Cause<{ readonly message: string }>) =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => "The gateway failed to reach the environment",
    onSome: (error) => error.message,
  });

const toolError = (message: string): CallToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

/** Session expiry and token rejection end an upstream client; anything else is the call's own outcome. */
const isStaleConnection = (error: unknown) =>
  error instanceof StreamableHTTPError && (error.code === 401 || error.code === 404);

const clientKey = (environment: EnvironmentRow, access: McpAccess) =>
  `${environment.environmentId}\u0000${environment.endpoint}\u0000${access}`;

/** A shared upstream client; an evicted one closes once its last call finishes. */
interface PooledClient {
  readonly client: Promise<Client>;
  inFlight: number;
  evicted: boolean;
}

const closeIfIdle = (pooled: PooledClient) => {
  if (pooled.evicted && pooled.inFlight === 0) {
    void pooled.client.then((connected) => connected.close()).catch(() => undefined);
  }
};

interface CachedTools {
  readonly tools: ReadonlyArray<Tool>;
  readonly fetchedAt: number;
}

const withEnvironmentArgument = (tool: Tool, slugs: ReadonlyArray<string>): Tool => ({
  ...tool,
  inputSchema: {
    ...tool.inputSchema,
    properties: {
      [ENVIRONMENT_ARGUMENT]: {
        type: "string",
        enum: [...slugs],
        description: `Slug of the T3 Code environment to run in. \`${LIST_ENVIRONMENTS_TOOL}\` lists them.`,
      },
      ...tool.inputSchema.properties,
    },
    required: [ENVIRONMENT_ARGUMENT, ...(tool.inputSchema.required ?? [])],
  },
});

const listEnvironmentsTool: Tool = {
  name: LIST_ENVIRONMENTS_TOOL,
  title: "List T3 Code environments",
  description:
    "List the T3 Code environments this connection reaches, with the slug every other tool takes.",
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

export class McpRelay extends Context.Service<
  McpRelay,
  {
    /** Answers one streamable-HTTP MCP request for an authenticated caller. */
    readonly handle: (
      request: Request,
      caller: McpCaller,
    ) => Effect.Effect<Response, McpRelayError>;
  }
>()("@t3code-gateway/server/mcp/relay/McpRelay") {}

export const make = Effect.gen(function* () {
  const environments = yield* EnvironmentRepository;
  const credentials = yield* McpUpstreamCredentials;
  const upstreamClients = new Map<string, PooledClient>();
  const toolCache = new Map<string, CachedTools>();
  const context = yield* Effect.context<never>();
  const run = Effect.runPromiseWith(context);
  const runExit = Effect.runPromiseExitWith(context);

  const runToken = async (effect: Effect.Effect<string, { readonly message: string }>) => {
    const exit = await runExit(effect);
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    throw new Error(failureMessage(exit.cause));
  };

  const connect = async (environment: EnvironmentRow, access: McpAccess) => {
    const transport = new StreamableHTTPClientTransport(
      new URL(joinBaseUrl(environment.endpoint, "/mcp")),
      {
        // Asks for the token on every request, so rotation needs no reconnect.
        fetch: async (url, init) => {
          const token = await runToken(credentials.ensure(environment.environmentId, access));
          const headers = new Headers(init?.headers);
          headers.set("authorization", `Bearer ${token}`);
          // @effect-diagnostics-next-line globalFetch:off -- the SDK transport takes a fetch function.
          const response = await fetch(url, { ...init, headers });
          if (response.status === 401) {
            await run(
              credentials
                .invalidate(environment.environmentId, access, token)
                .pipe(Effect.catch(() => Effect.void)),
            );
          }
          return response;
        },
      },
    );
    const client = new Client({ name: "t3code-gateway", version: GATEWAY_VERSION });
    // The SDK's own transport declares `sessionId?: string`, which `exactOptionalPropertyTypes` rejects for `Transport`.
    await client.connect(transport as Transport);
    return client;
  };

  // Eviction leaves other callers' calls running: closing the client would cancel them all.
  const evict = (key: string, pooled: PooledClient) => {
    if (upstreamClients.get(key) === pooled) {
      upstreamClients.delete(key);
    }
    pooled.evicted = true;
    closeIfIdle(pooled);
  };

  const pooledClient = (key: string, environment: EnvironmentRow, access: McpAccess) => {
    const existing = upstreamClients.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const pooled: PooledClient = {
      client: connect(environment, access),
      inFlight: 0,
      evicted: false,
    };
    // A failed connect must not stay pooled, or every later call fails with its error.
    pooled.client.catch(() => evict(key, pooled));
    upstreamClients.set(key, pooled);
    return pooled;
  };

  /** Closes clients of environments that were removed, disabled or moved to another endpoint. */
  const pruneClients = (rows: ReadonlyArray<EnvironmentRow>) => {
    const live = new Set(
      rows
        .filter((row) => row.enabled)
        .flatMap((row) => MCP_ACCESS_LEVELS.map((access) => clientKey(row, access))),
    );
    for (const [key, pooled] of upstreamClients) {
      if (!live.has(key)) {
        evict(key, pooled);
      }
    }
  };

  /** Runs `use` on a pooled client; a stale session or rejected token reconnects once. */
  const withUpstream = <A>(
    environment: EnvironmentRow,
    access: McpAccess,
    use: (client: Client) => Promise<A>,
  ) =>
    Effect.tryPromise({
      try: async () => {
        const key = clientKey(environment, access);
        for (let attempt = 0; ; attempt++) {
          const pooled = pooledClient(key, environment, access);
          pooled.inFlight++;
          try {
            return await use(await pooled.client);
          } catch (error) {
            // A tool error is the call's outcome; anything else may have broken the client.
            if (!(error instanceof McpError) || error.code === ErrorCode.ConnectionClosed) {
              evict(key, pooled);
            }
            // The environment never ran a call it answered 401 or 404 to, so retrying is safe.
            if (attempt === 0 && isStaleConnection(error)) {
              continue;
            }
            throw error;
          } finally {
            pooled.inFlight--;
            closeIfIdle(pooled);
          }
        }
      },
      catch: (cause) =>
        cause instanceof McpError
          ? fromUpstream(cause)
          : relayError(cause, "The environment did not answer"),
    });

  const callerEnvironments = (caller: McpCaller) =>
    environments.listEnvironments.pipe(
      Effect.tap((rows) => Effect.sync(() => pruneClients(rows))),
      Effect.map((rows) =>
        rows.filter(
          (row) =>
            row.enabled &&
            (caller.environmentIds === null || caller.environmentIds.includes(row.environmentId)),
        ),
      ),
      Effect.mapError(
        (error) => new McpRelayError({ message: `Could not load environments: ${error.message}` }),
      ),
    );

  const environmentTools = (environment: EnvironmentRow, access: McpAccess) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const cacheKey = clientKey(environment, access);
      const cached = toolCache.get(cacheKey);
      if (cached !== undefined && now - cached.fetchedAt < TOOL_CACHE_TTL_MS) {
        return cached.tools;
      }
      const tools = yield* withUpstream(environment, access, async (client) => {
        const tools: Array<Tool> = [];
        let cursor: string | undefined;
        do {
          const page = await client.listTools(cursor === undefined ? {} : { cursor });
          tools.push(...page.tools);
          cursor = page.nextCursor;
        } while (cursor !== undefined);
        return tools;
      });
      toolCache.set(cacheKey, { tools, fetchedAt: now });
      return tools;
    });

  const listTools = (caller: McpCaller) =>
    Effect.gen(function* () {
      const reachable = yield* callerEnvironments(caller);
      const listed = yield* Effect.forEach(
        reachable,
        (environment) =>
          environmentTools(environment, caller.access).pipe(
            Effect.map((tools) => ({ environment, tools })),
            Effect.catch((cause) =>
              Effect.logWarning("Could not list MCP tools of environment").pipe(
                Effect.annotateLogs({
                  environmentId: environment.environmentId,
                  reason: cause.message,
                }),
                Effect.as({ environment, tools: [] satisfies ReadonlyArray<Tool> }),
              ),
            ),
          ),
        { concurrency: "unbounded" },
      );

      const byName = new Map<string, { tool: Tool; slugs: Array<string> }>();
      for (const { environment, tools } of listed) {
        for (const tool of tools) {
          if (!isRelayedTool(tool.name)) {
            continue;
          }
          const entry = byName.get(tool.name);
          if (entry === undefined) {
            byName.set(tool.name, { tool, slugs: [environment.slug] });
          } else {
            entry.slugs.push(environment.slug);
          }
        }
      }
      return [
        listEnvironmentsTool,
        ...[...byName.values()].map(({ tool, slugs }) => withEnvironmentArgument(tool, slugs)),
      ];
    });

  const listEnvironments = (caller: McpCaller) =>
    callerEnvironments(caller).pipe(
      Effect.map((rows): CallToolResult => {
        const listed = rows.map((row) => ({ slug: row.slug, label: row.label }));
        return {
          content: [{ type: "text", text: JSON.stringify(listed, null, 2) }],
          structuredContent: { environments: listed },
        };
      }),
    );

  const callTool = (
    caller: McpCaller,
    name: string,
    args: Record<string, unknown> | undefined,
    signal: AbortSignal,
  ): Effect.Effect<CallToolResult, RelayRpcError | McpRelayError> =>
    Effect.gen(function* () {
      if (name === LIST_ENVIRONMENTS_TOOL) {
        return yield* listEnvironments(caller);
      }
      if (!isRelayedTool(name)) {
        return yield* Effect.fail(
          new RelayRpcError(
            ErrorCode.InvalidParams,
            `Tool ${name} is not available through the gateway`,
          ),
        );
      }
      const { [ENVIRONMENT_ARGUMENT]: slug, ...forwarded } = args ?? {};
      if (typeof slug !== "string") {
        return yield* Effect.fail(
          new RelayRpcError(
            ErrorCode.InvalidParams,
            `Missing required argument ${ENVIRONMENT_ARGUMENT}`,
          ),
        );
      }
      const reachable = yield* callerEnvironments(caller);
      const environment = reachable.find((row) => row.slug === slug);
      if (environment === undefined) {
        // A client may hold a tool list from before an environment was renamed or removed.
        return yield* Effect.fail(
          new RelayRpcError(
            ErrorCode.InvalidParams,
            `Unknown environment ${slug}; reachable environments: ${
              reachable.map((row) => row.slug).join(", ") || "none"
            }`,
          ),
        );
      }

      return yield* withUpstream(
        environment,
        caller.access,
        (client) =>
          client.callTool({ name, arguments: forwarded }, undefined, {
            signal,
            timeout: UPSTREAM_CALL_TIMEOUT_MS,
            resetTimeoutOnProgress: true,
          }) as Promise<CallToolResult>,
      ).pipe(
        Effect.catch((cause) =>
          cause instanceof RelayRpcError
            ? Effect.fail(cause)
            : // The cause names internal endpoints; the agent only needs to know the call did not run.
              Effect.logWarning("MCP relay call failed").pipe(
                Effect.annotateLogs({
                  environmentId: environment.environmentId,
                  reason: cause.message,
                }),
                Effect.as(toolError(`Environment ${slug} is unavailable; try again later`)),
              ),
        ),
      );
    });

  /** Runs an Effect from an SDK handler, rethrowing MCP errors so their codes reach the client. */
  const runHandler = async <A>(effect: Effect.Effect<A, RelayRpcError | McpRelayError>) => {
    const exit = await runExit(effect);
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
    if (error instanceof RelayRpcError) {
      throw error;
    }
    throw new RelayRpcError(ErrorCode.InternalError, failureMessage(exit.cause));
  };

  const createServer = (caller: McpCaller) => {
    const server = new Server(
      { name: "t3code-gateway", title: "T3 Code Gateway", version: GATEWAY_VERSION },
      { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
    );
    server.setRequestHandler(ListToolsRequestSchema, () =>
      runHandler(listTools(caller).pipe(Effect.map((tools) => ({ tools })))),
    );
    server.setRequestHandler(CallToolRequestSchema, (request, extra) =>
      runHandler(callTool(caller, request.params.name, request.params.arguments, extra.signal)),
    );
    return server;
  };

  // Stateless: every request gets its own server, so the gateway keeps no downstream sessions.
  const handle = (request: Request, caller: McpCaller) =>
    Effect.tryPromise({
      try: async () => {
        const server = createServer(caller);
        // Without `sessionIdGenerator` the transport is stateless.
        const transport = new WebStandardStreamableHTTPServerTransport({
          enableJsonResponse: true,
        });
        await server.connect(transport);
        try {
          return await transport.handleRequest(request);
        } finally {
          await server.close();
        }
      },
      catch: (cause) => relayError(cause, "MCP request failed"),
    });

  yield* Effect.addFinalizer(() =>
    Effect.promise(() =>
      Promise.allSettled(
        [...upstreamClients.values()].map((pooled) =>
          pooled.client.then((connected) => connected.close()),
        ),
      ),
    ),
  );

  return McpRelay.of({ handle });
});

export const layer = Layer.effect(McpRelay, make);
