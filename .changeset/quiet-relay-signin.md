---
"@t3code-gateway/contracts": minor
"@t3code-gateway/server": minor
---

Sign the gateway in to each environment's MCP server for the upcoming MCP relay. The gateway gets
`mcp-client` tokens through T3 Code's MCP OAuth with its admin token, without a browser, stores
them encrypted per access level, rotates them a week before they expire, and revokes them when an
environment is removed.
