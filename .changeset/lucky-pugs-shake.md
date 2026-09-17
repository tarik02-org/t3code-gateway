---
"@t3code-gateway/web": patch
---

Always show the remove button for downloaded T3 Code versions. It previously disappeared for
pinned and active versions, which left no indication that removing them was possible at all.
It now sits in its own column and is disabled with a tooltip explaining why, and the "Bundled"
badge moved into that column since bundled versions cannot be removed.
