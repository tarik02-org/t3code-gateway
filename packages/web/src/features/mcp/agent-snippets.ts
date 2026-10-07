/** How to add the gateway to one agent: OAuth when the agent signs in itself, a token otherwise. */
export interface AgentSnippet {
  readonly agentId: string;
  readonly title: string;
  /** One short line; `code` spans in backticks. */
  readonly caption: string;
  readonly code?: string;
  /** Values an agent's own settings ask for, each copied on its own. */
  readonly fields?: ReadonlyArray<{ readonly label: string; readonly value: string }>;
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
  const headers = header === null ? {} : { headers: { Authorization: header } };
  return [
    {
      agentId: "generic",
      title: "Generic",
      caption:
        header === null
          ? "Any MCP client with OAuth: it registers and signs in on its own."
          : "Any MCP client that can send a header.",
      fields: [
        { label: "URL", value: mcpUrl },
        { label: "Transport", value: "Streamable HTTP" },
        ...(header === null ? [] : [{ label: "Authorization", value: header }]),
      ],
    },
    {
      agentId: "claude-code",
      title: "Claude Code",
      caption: header === null ? "Then sign in with `/mcp` in Claude Code." : "Run in a terminal.",
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
          ? "In `~/.codex/config.toml`, then `codex mcp login t3-gateway`."
          : `In \`~/.codex/config.toml\`, with the token in \`${TOKEN_ENV}\`.`,
      code: [
        `[mcp_servers.${SERVER_NAME}]`,
        `url = "${mcpUrl}"`,
        ...(header === null ? [] : [`bearer_token_env_var = "${TOKEN_ENV}"`]),
        // `t3_thread_wait` outlasts Codex's default 60 s tool timeout.
        "tool_timeout_sec = 900",
      ].join("\n"),
    },
    {
      agentId: "cursor",
      title: "Cursor",
      caption: "In `~/.cursor/mcp.json`.",
      code: json({ mcpServers: { [SERVER_NAME]: { url: mcpUrl, ...headers } } }),
    },
    {
      agentId: "vscode",
      title: "VS Code",
      caption: "In `.vscode/mcp.json` or the user `mcp.json`.",
      code: json({ servers: { [SERVER_NAME]: { type: "http", url: mcpUrl, ...headers } } }),
    },
    {
      agentId: "opencode",
      title: "OpenCode",
      caption:
        header === null ? "In `opencode.json`; it signs in on first use." : "In `opencode.json`.",
      code: json({
        $schema: "https://opencode.ai/config.json",
        mcp: {
          [SERVER_NAME]: {
            type: "remote",
            url: mcpUrl,
            enabled: true,
            ...(header === null ? {} : { oauth: false, ...headers }),
          },
        },
      }),
    },
    {
      agentId: "gemini",
      title: "Gemini CLI",
      caption:
        header === null
          ? "In `~/.gemini/settings.json`, then `/mcp auth t3-gateway`."
          : "In `~/.gemini/settings.json`.",
      code: json({ mcpServers: { [SERVER_NAME]: { httpUrl: mcpUrl, ...headers } } }),
    },
    ...(header === null
      ? [
          {
            agentId: "claude-ai",
            title: "Claude app",
            caption: "Settings → Connectors → Add custom connector. Needs a public https URL.",
            fields: [{ label: "URL", value: mcpUrl }],
          },
        ]
      : []),
  ];
};
