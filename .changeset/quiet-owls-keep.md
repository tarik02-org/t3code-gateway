---
"@t3code-gateway/web": patch
---

Keep T3 Code's own settings when adding or removing an environment from the gateway. The gateway
rewrote the saved connection catalog with only the keys it knew, so every add or remove switched
disabled environments back on and dropped GitHub routing permissions.
