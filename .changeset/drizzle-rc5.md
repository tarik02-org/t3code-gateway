---
"@t3code-gateway/server": patch
---

Update drizzle to v1.0.0-rc.5 and use its built-in Effect `node:sqlite` driver instead of the local one. The
local drizzle-orm patch is gone, since its Effect 4 fixes are now upstream. The database now runs in WAL mode
with a 5-second busy timeout.
