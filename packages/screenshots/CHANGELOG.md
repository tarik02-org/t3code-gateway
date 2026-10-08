# @t3code-gateway/screenshots

## 0.6.0

### Patch Changes

- e889548: Support T3 Code's granular permissions. This requires T3 Code `2026.9.701-nightly.20261007.551` or
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

- Updated dependencies [e889548]
  - @t3code-gateway/contracts@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [a935b94]
- Updated dependencies [81d7762]
  - @t3code-gateway/contracts@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [b8c711f]
- Updated dependencies [ed2f55e]
- Updated dependencies [d3da415]
- Updated dependencies [d3da415]
  - @t3code-gateway/contracts@0.4.0

## 0.3.1

### Patch Changes

- @t3code-gateway/contracts@0.3.1

## 0.3.0

### Minor Changes

- e3a3dba: Support a GitHub token for T3 Code Web update checks. Set it in the admin UI (T3 Code Versions)
  or with `T3_GATEWAY_GITHUB_TOKEN` during deployment; the UI value wins when both are set. The UI
  value is encrypted at rest with the gateway secret key, like environment tokens. A token
  with no scopes is enough and raises the GitHub API quota from 60 to 5,000 requests per hour.

### Patch Changes

- Updated dependencies [e3a3dba]
  - @t3code-gateway/contracts@0.3.0

## 0.2.0

### Minor Changes

- 3554454: Support bundled stable and nightly T3 Code Web versions, with pinning, garbage collection, opt-in GitHub updates, and version management in the admin UI.

### Patch Changes

- Updated dependencies [3554454]
  - @t3code-gateway/contracts@0.2.0

## 0.1.4

### Patch Changes

- Updated dependencies [bf536be]
  - @t3code-gateway/contracts@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [8bf770b]
  - @t3code-gateway/contracts@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [5f81b11]
  - @t3code-gateway/contracts@0.1.2

## 0.1.1

### Patch Changes

- @t3code-gateway/contracts@0.1.1

## 0.0.1

### Patch Changes

- Updated dependencies [db5a1df]
- Updated dependencies [ff5cda1]
- Updated dependencies [784e370]
- Updated dependencies [caccae4]
- Updated dependencies [d25b903]
- Updated dependencies [0bd879f]
  - @t3code-gateway/contracts@0.1.0
