---
"@t3code-gateway/contracts": minor
"@t3code-gateway/server": minor
"@t3code-gateway/web": minor
---

Show whether each environment's MCP endpoint accepts callers outside T3 Code. A new MCP column
probes the endpoint with the gateway's admin token and reports Available (with the number of
tools that serve external callers), Unsupported for T3 Code builds that only accept their own
agents, or Unavailable with the reason.
