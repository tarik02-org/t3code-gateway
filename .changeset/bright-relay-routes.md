---
"@t3code-gateway/contracts": minor
"@t3code-gateway/server": minor
---

Relay T3 Code's MCP tools through the gateway's own `/mcp`. Clients authenticate with gateway
tokens (`t3gw_…`) that name an access level and the environments they reach. Every tool gets an
`environment` argument, `gateway_list_environments` lists the reachable ones, and tools that only
work inside a T3 thread are hidden. New RPCs create, list and revoke tokens and show the gateway's
sign-in to each environment.
