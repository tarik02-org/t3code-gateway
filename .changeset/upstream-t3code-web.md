---
"@t3code-gateway/server": minor
---

Take T3 Code Web from upstream `pingdotgg/t3code` instead of the `tarik02-org/t3code` fork. The
gateway now unpacks the web app from the release's `t3-<version>-linux-x64.tar.gz` CLI tarball and
checks it against the SHA-256 digest GitHub reports. On startup it deletes builds downloaded from
the fork, whose calendar versions would outrank upstream's, and clears pins to versions that are no
longer installed.
