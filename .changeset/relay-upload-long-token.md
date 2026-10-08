---
"@t3code-gateway/server": patch
---

Fix MCP relay attachment uploads, which returned 404 for every real upload because the gateway's
router drops path segments longer than 100 characters.
