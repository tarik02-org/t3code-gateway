---
"@t3code-gateway/server": minor
---

Fix "Environment returned invalid JSON" on the Sessions page for current T3 Code nightlies, which removed
`GET /api/auth/clients`. The gateway now keeps one auth-access WebSocket subscription per enabled environment
(through `t3code-cli`), caches the reported client sessions in a new `environment_client_sessions` table, and
serves the Sessions page from that cache, so it still lists sessions while an environment is unreachable.
Admin token checks and rotation use `GET /api/auth/session` and the token's own session id instead of the
removed list. Effect is updated to 4.1.2.
