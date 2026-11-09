---
"@t3code-gateway/server": patch
---

Stop rotating MCP OAuth refresh tokens. A refresh now returns a new access token and the same
refresh token, which stays valid until its original 90-day expiry or revocation, so a client that
loses a refresh reply can retry instead of being signed out.
