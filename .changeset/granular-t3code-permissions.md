---
"@t3code-gateway/contracts": minor
"@t3code-gateway/server": minor
"@t3code-gateway/web": minor
"@t3code-gateway/screenshots": patch
---

Support T3 Code's granular permissions. This requires T3 Code `2026.9.701-nightly.20261007.551` or
newer.

- Browser tokens now ask for T3 Code's standard client permissions (files, diffs, settings,
  providers, previews, terminals, source control, diagnostics), and the pairing dialog lists all of
  them.
- A migration adds the permissions that T3 Code used to imply to each environment's saved scope
  list, so existing environments keep the access they had.
- Admin tokens must hold the new permissions. Environments paired before this change show "pair
  again" until they are re-paired.
- Client sessions show their full permissions.
- The bundled nightly T3 Code Web is now `2026.9.701-nightly.20261008.553`.
- The nightly update channel only takes nightly releases (not canary or preview builds) and picks
  the highest version.
- The MCP relay hides `t3_identity`, which needs a calling thread.
- Relay agents can attach files: `t3_attachment_prepare_upload` now returns an upload address on the
  gateway, which passes the upload to the environment that signed it.
- Removing an environment from T3 Code Web also removes the LAN and tailnet routes T3 Code learned
  through the gateway. Once no route is left, its cached data is cleared too.
- Unreadable saved environments are no longer overwritten.
