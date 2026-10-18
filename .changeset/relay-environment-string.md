---
"@t3code-gateway/server": patch
---

Accept any environment slug on relayed MCP tools instead of an enum. The enum listed only the
environments whose tool listing succeeded, so a model couldn't call the others.
