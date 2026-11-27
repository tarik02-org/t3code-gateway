---
"@t3code-gateway/server": patch
"@t3code-gateway/web": patch
---

Support T3 Code's v5 IndexedDB schema by opening existing catalog databases at their current version
and adding the `query` cache store (with its `environment-updated` index) on initialization and
cleanup. Update bundled T3 Code Web to `v0.1.13` (stable) and `v0.1.14-nightly.20261127.5332`
(nightly), move the container image to Node 24.22.3 and Traefik 3.8.0, and refresh workspace and
Nix dependencies.
