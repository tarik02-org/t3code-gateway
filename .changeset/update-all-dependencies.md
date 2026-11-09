---
"@t3code-gateway/server": patch
---

Update dependencies: refresh the lockfile (Tailwind CSS 4.3.5 and other in-range updates), move the
container image to Node 24.22.2, and update GitHub Actions. `@effect/platform-node-shared` is now pinned
to the Effect release so lockfile refreshes cannot pull a build that needs a newer Effect.
