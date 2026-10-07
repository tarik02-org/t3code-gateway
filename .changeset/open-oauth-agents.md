---
"@t3code-gateway/contracts": minor
"@t3code-gateway/server": minor
"@t3code-gateway/web": minor
---

Let MCP clients sign in to the gateway with OAuth. The gateway publishes OAuth discovery metadata,
registers clients dynamically (stateless, sealed client ids), and sends the browser to a new consent
page where a signed-in admin picks the access level and environments. Clients get one-hour access
tokens and rotating 90-day refresh tokens. Login now returns to the admin page it interrupted.
