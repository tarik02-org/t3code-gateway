/** One way to add the gateway to an agent: OAuth when the agent signs in itself, a token otherwise. */
export interface AgentSnippet {
  readonly agentId: string;
  readonly title: string;
  readonly caption: string;
  readonly code: string;
}

const SERVER_NAME = "t3-gateway";
const TOKEN_ENV = "T3_GATEWAY_TOKEN";

const json = (value: unknown) => JSON.stringify(value, null, 2);

/**
 * Setup for widely used agents. With `token === null` the agent signs in
 * through the gateway's OAuth; otherwise it sends the token as a header.
 */
export const agentSnippets = (
  mcpUrl: string,
  token: string | null,
): ReadonlyArray<AgentSnippet> => {
  const header = token === null ? null : `Bearer ${token}`;
  return [
    {
      agentId: "claude-code",
      title: "Claude Code",
      caption:
        header === null
          ? "Run once, then sign in from `/mcp` inside Claude Code."
          : "Run once in a terminal.",
      code:
        header === null
          ? `claude mcp add --transport http --scope user ${SERVER_NAME} ${mcpUrl}`
          : `claude mcp add --transport http --scope user ${SERVER_NAME} ${mcpUrl} \\\n  --header "Authorization: ${header}"`,
    },
    {
      agentId: "codex",
      title: "Codex",
      caption:
        header === null
          ? "Add to `~/.codex/config.toml`, then run `codex mcp login t3-gateway`. The timeout lets `t3_thread_wait` run past the default 60 s."
          : `Add to \`~/.codex/config.toml\` and export ${TOKEN_ENV} with the token. The timeout lets \`t3_thread_wait\` run past the default 60 s.`,
      code: [
        `[mcp_servers.${SERVER_NAME}]`,
        `url = "${mcpUrl}"`,
        ...(header === null ? [] : [`bearer_token_env_var = "${TOKEN_ENV}"`]),
        "tool_timeout_sec = 900",
      ].join("\n"),
    },
    {
      agentId: "cursor",
      title: "Cursor",
      caption:
        header === null
          ? "Add to `~/.cursor/mcp.json`; Cursor asks you to sign in."
          : "Add to `~/.cursor/mcp.json`.",
      code: json({
        mcpServers: {
          [SERVER_NAME]: {
            url: mcpUrl,
            ...(header === null ? {} : { headers: { Authorization: header } }),
          },
        },
      }),
    },
    {
      agentId: "vscode",
      title: "VS Code",
      caption:
        header === null
          ? "Add to `.vscode/mcp.json` (or the user `mcp.json`); VS Code asks you to sign in."
          : "Add to `.vscode/mcp.json` (or the user `mcp.json`).",
      code: json({
        servers: {
          [SERVER_NAME]: {
            type: "http",
            url: mcpUrl,
            ...(header === null ? {} : { headers: { Authorization: header } }),
          },
        },
      }),
    },
    {
      agentId: "opencode",
      title: "OpenCode",
      caption:
        header === null
          ? "Add to `opencode.json`; OpenCode signs in on first use, or run `opencode mcp auth t3-gateway`."
          : "Add to `opencode.json`.",
      code: json({
        $schema: "https://opencode.ai/config.json",
        mcp: {
          [SERVER_NAME]: {
            type: "remote",
            url: mcpUrl,
            enabled: true,
            ...(header === null ? {} : { oauth: false, headers: { Authorization: header } }),
          },
        },
      }),
    },
    {
      agentId: "gemini",
      title: "Gemini CLI",
      caption:
        header === null
          ? "Add to `~/.gemini/settings.json`, then run `/mcp auth t3-gateway` in Gemini CLI."
          : "Add to `~/.gemini/settings.json`.",
      code: json({
        mcpServers: {
          [SERVER_NAME]: {
            httpUrl: mcpUrl,
            ...(header === null ? {} : { headers: { Authorization: header } }),
          },
        },
      }),
    },
    ...(header === null
      ? [
          {
            agentId: "claude-ai",
            title: "Claude app",
            caption:
              "Settings → Connectors → Add custom connector, and paste the URL. The gateway must be reachable over https from the internet.",
            code: mcpUrl,
          },
        ]
      : []),
  ];
};
