---
"@t3code-gateway/contracts": minor
"@t3code-gateway/server": minor
"@t3code-gateway/web": minor
---

Turn MCP on or off per environment. The `MCP` column is now a switch, also in the edit dialog, on by
default. Turning it off removes the environment from the relay and signs the gateway out of it;
turning it on needs nothing, the gateway signs in when an agent first uses it. A failing sign-in
shows as a red dot next to the switch.
