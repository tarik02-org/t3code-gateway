# @t3code-gateway/contracts

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
