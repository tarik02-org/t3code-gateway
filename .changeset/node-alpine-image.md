---
"@t3code-gateway/server": patch
---

Build the image on Node 24.22.0. The Alpine 3.24 update left the image on `node:24.13.1-alpine3.24`,
which doesn't exist, so the 0.7.0 image never published.
