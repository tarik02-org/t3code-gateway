---
"@t3code-gateway/server": patch
---

Fix T3 Code Web updates failing with "Could not install the T3 Code Web update". The release
archive nests everything under a `dist/` directory, and the entry for that directory itself
resolved to the extraction directory, so the first write of every download hit `EISDIR` and
left an empty staging directory behind. Directory entries are now skipped.
