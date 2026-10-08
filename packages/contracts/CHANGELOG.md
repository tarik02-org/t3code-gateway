# @t3code-gateway/contracts

## 0.6.0

### Minor Changes

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

## 0.5.0

### Minor Changes

- a935b94: Add a Sessions page listing every environment's authorized clients in one table, with search, last
  connection, expiry and revoke. The gateway's own sessions (its admin token and its MCP sign-ins) are
  marked, hidden by default and cannot be revoked from the page.
- 81d7762: Turn MCP on or off per environment. The `MCP` column is now a switch, also in the edit dialog, on by
  default. Turning it off removes the environment from the relay and signs the gateway out of it;
  turning it on needs nothing, the gateway signs in when an agent first uses it. A failing sign-in
  shows as a red dot next to the switch.

## 0.4.0

### Minor Changes

- b8c711f: Relay T3 Code's MCP tools through the gateway's own `/mcp`. Clients authenticate with gateway
  tokens (`t3gw_…`) that name an access level and the environments they reach. Every tool gets an
  `environment` argument, `gateway_list_environments` lists the reachable ones, and tools that only
  work inside a T3 thread are hidden. New RPCs create, list and revoke tokens and show the gateway's
  sign-in to each environment.
- ed2f55e: Let MCP clients sign in to the gateway with OAuth. The gateway publishes OAuth discovery metadata,
  registers clients dynamically (stateless, sealed client ids), and sends the browser to a new consent
  page where a signed-in admin picks the access level and environments. Clients get one-hour access
  tokens and rotating 90-day refresh tokens. Login now returns to the admin page it interrupted.
- d3da415: Sign the gateway in to each environment's MCP server for the upcoming MCP relay. The gateway gets
  `mcp-client` tokens through T3 Code's MCP OAuth with its admin token, without a browser, stores
  them encrypted per access level, rotates them a week before they expire, and revokes them when an
  environment is removed.

### Patch Changes

- d3da415: Stop asking T3 Code for the `review:write` scope, which it never grants to pairing credentials. Admin
  token rotation no longer fails its scope check on current T3 Code builds, and stored browser token
  scopes drop it so catalog tokens can be minted again.

## 0.3.1

## 0.3.0

### Minor Changes

- e3a3dba: Support a GitHub token for T3 Code Web update checks. Set it in the admin UI (T3 Code Versions)
  or with `T3_GATEWAY_GITHUB_TOKEN` during deployment; the UI value wins when both are set. The UI
  value is encrypted at rest with the gateway secret key, like environment tokens. A token
  with no scopes is enough and raises the GitHub API quota from 60 to 5,000 requests per hour.

## 0.2.0

### Minor Changes

- 3554454: Support bundled stable and nightly T3 Code Web versions, with pinning, garbage collection, opt-in GitHub updates, and version management in the admin UI.

## 0.1.4

### Patch Changes

- bf536be: rotate environment admin tokens before expiry and show their maintenance status

## 0.1.3

### Patch Changes

- 8bf770b: Allow environment edits without reconnecting when the endpoint is unchanged, and support replacing pairing credentials from the edit form.

## 0.1.2

### Patch Changes

- 5f81b11: Update the bundled T3 Code web dist to the latest nightly.

## 0.1.1

## 0.1.0

### Minor Changes

- 784e370: Initial T3 Code Gateway release.

### Patch Changes

- db5a1df: Bundle the pinned T3 Code web dist in published container images.
- ff5cda1: Remember pairing labels, submit pairing forms with Enter, add an Open action, cap QR codes at 320px, and hide Web controls when the bundled WebUI is unavailable.
- caccae4: Gate bundled T3 Code pages behind gateway login, move browser catalog injection to a manual admin action, route admin environment operations through Effect RPC, and clean up the admin browser-install flow with toast feedback and schema-backed catalog parsing.
- d25b903: Update the bundled T3 Code web dist to the latest nightly.
- 0bd879f: Update the pinned bundled T3 Code web dist.
