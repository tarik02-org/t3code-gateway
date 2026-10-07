# @t3code-gateway/web

## 0.5.0

### Minor Changes

- a935b94: Add a Sessions page listing every environment's authorized clients in one table, with search, last
  connection, expiry and revoke. The gateway's own sessions (its admin token and its MCP sign-ins) are
  marked, hidden by default and cannot be revoked from the page.
- 81d7762: Turn MCP on or off per environment. The `MCP` column is now a switch, also in the edit dialog, on by
  default. Turning it off removes the environment from the relay and signs the gateway out of it;
  turning it on needs nothing, the gateway signs in when an agent first uses it. A failing sign-in
  shows as a red dot next to the switch.

### Patch Changes

- Updated dependencies [a935b94]
- Updated dependencies [81d7762]
  - @t3code-gateway/contracts@0.5.0

## 0.4.0

### Minor Changes

- 4acb9cf: Add an MCP page to the admin UI listing connected agents (OAuth and tokens) with revoke. A
  `Connect agent` dialog shows the gateway's MCP URL with generic setup (endpoint, OAuth metadata,
  header) and setup for Claude Code, Codex, Cursor, VS Code, OpenCode, Gemini CLI and the Claude app,
  for OAuth or a token. A `Create token` dialog creates tokens. The environments table gets an `MCP`
  column with the gateway's own sign-in to each environment.

  The `MCP` badge opens the gateway's sign-ins for that environment with a `Sign out` button, which
  revokes them in T3 Code; the next agent call signs in again.

- ed2f55e: Let MCP clients sign in to the gateway with OAuth. The gateway publishes OAuth discovery metadata,
  registers clients dynamically (stateless, sealed client ids), and sends the browser to a new consent
  page where a signed-in admin picks the access level and environments. Clients get one-hour access
  tokens and rotating 90-day refresh tokens. Login now returns to the admin page it interrupted.

### Patch Changes

- d3da415: Stop asking T3 Code for the `review:write` scope, which it never grants to pairing credentials. Admin
  token rotation no longer fails its scope check on current T3 Code builds, and stored browser token
  scopes drop it so catalog tokens can be minted again.
- 3624f56: Keep T3 Code's own settings when adding or removing an environment from the gateway. The gateway
  rewrote the saved connection catalog with only the keys it knew, so every add or remove switched
  disabled environments back on and dropped GitHub routing permissions.
- Updated dependencies [b8c711f]
- Updated dependencies [ed2f55e]
- Updated dependencies [d3da415]
- Updated dependencies [d3da415]
  - @t3code-gateway/contracts@0.4.0

## 0.3.1

### Patch Changes

- 19b0348: Always show the remove button for downloaded T3 Code versions. It previously disappeared for
  pinned and active versions, which left no indication that removing them was possible at all.
  It now sits in its own column and is disabled with a tooltip explaining why, and the "Bundled"
  badge moved into that column since bundled versions cannot be removed.
  - @t3code-gateway/contracts@0.3.1

## 0.3.0

### Minor Changes

- e3a3dba: Support a GitHub token for T3 Code Web update checks. Set it in the admin UI (T3 Code Versions)
  or with `T3_GATEWAY_GITHUB_TOKEN` during deployment; the UI value wins when both are set. The UI
  value is encrypted at rest with the gateway secret key, like environment tokens. A token
  with no scopes is enough and raises the GitHub API quota from 60 to 5,000 requests per hour.

### Patch Changes

- adc5b4b: Show notifications above open dialogs. The toast viewport shared its stacking level with the
  dialog backdrop, so a toast raised while a dialog was open was painted behind the overlay and
  appeared dimmed and unclickable.
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

- bf536be: rotate environment admin tokens before expiry and show their maintenance status
- Updated dependencies [bf536be]
  - @t3code-gateway/contracts@0.1.4

## 0.1.3

### Patch Changes

- 8bf770b: Allow environment edits without reconnecting when the endpoint is unchanged, and support replacing pairing credentials from the edit form.
- Updated dependencies [8bf770b]
  - @t3code-gateway/contracts@0.1.3

## 0.1.2

### Patch Changes

- 5f81b11: Update the bundled T3 Code web dist to the latest nightly.
- Updated dependencies [5f81b11]
  - @t3code-gateway/contracts@0.1.2

## 0.1.1

### Patch Changes

- @t3code-gateway/contracts@0.1.1

## 0.1.0

### Minor Changes

- 784e370: Initial T3 Code Gateway release.

### Patch Changes

- 95d5014: Share copy button behavior across admin views and show copied feedback with icon tooltips.
- db5a1df: Bundle the pinned T3 Code web dist in published container images.
- 3ba8948: Collapse repeated hyphens in automatically generated environment slugs.
- bf53c21: Replace browser confirmations with gateway dialogs and move web installation to a switch column.
- ff5cda1: Remember pairing labels, submit pairing forms with Enter, add an Open action, cap QR codes at 320px, and hide Web controls when the bundled WebUI is unavailable.
- caccae4: Gate bundled T3 Code pages behind gateway login, move browser catalog injection to a manual admin action, route admin environment operations through Effect RPC, and clean up the admin browser-install flow with toast feedback and schema-backed catalog parsing.
- 0a6645d: Create and repair all T3 Code connection runtime IndexedDB stores when installing gateway environments.
- 80ee2e6: Restore the bordered pairing permissions list and correct the pairing dialog layout.
- 743ad7c: Sync the T3 Code IndexedDB version and stores with upstream.
- 7aebb24: Refresh the gateway admin UI with T3 Code's updated palette and glass styling.
- d25b903: Update the bundled T3 Code web dist to the latest nightly.
- 0bd879f: Update the pinned bundled T3 Code web dist.
- Updated dependencies [db5a1df]
- Updated dependencies [ff5cda1]
- Updated dependencies [784e370]
- Updated dependencies [caccae4]
- Updated dependencies [d25b903]
- Updated dependencies [0bd879f]
  - @t3code-gateway/contracts@0.1.0
