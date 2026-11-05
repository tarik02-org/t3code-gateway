---
"@t3code-gateway/server": patch
---

Serve relayed MCP tools from a stale-while-revalidate cache so an unavailable environment never
blocks tool discovery. Successful listings refresh daily in the background, while failures retain
stale tools and retry after five minutes.
