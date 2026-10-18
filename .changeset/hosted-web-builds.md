---
"@t3code-gateway/server": patch
---

Serve the hosted T3 Code web app again. The `client/` in upstream's CLI tarballs expects to be
served by the T3 Code server and failed with "Primary environment request failed during
fetch-session-state (HTTP 404)". The gateway now downloads `T3-Code-Web-<version>.zip` from
`tarik02-org/t3code-web-builds`, which builds upstream's hosted web app from each release. Builds
downloaded from earlier sources are removed on startup.
