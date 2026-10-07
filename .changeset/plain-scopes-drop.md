---
"@t3code-gateway/contracts": patch
"@t3code-gateway/server": patch
"@t3code-gateway/web": patch
---

Stop asking T3 Code for the `review:write` scope, which it never grants to pairing credentials. Admin
token rotation no longer fails its scope check on current T3 Code builds, and stored browser token
scopes drop it so catalog tokens can be minted again.
