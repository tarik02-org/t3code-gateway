---
"@t3code-gateway/web": minor
---

Add an MCP page to the admin UI listing connected agents (OAuth and tokens) with revoke. A
`Connect agent` dialog shows the gateway's MCP URL with generic setup (endpoint, OAuth metadata,
header) and setup for Claude Code, Codex, Cursor, VS Code, OpenCode, Gemini CLI and the Claude app,
for OAuth or a token. A `Create token` dialog creates tokens. The environments table gets an `MCP`
column with the gateway's own sign-in to each environment.
