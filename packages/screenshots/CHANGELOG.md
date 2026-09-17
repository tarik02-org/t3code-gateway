# @t3code-gateway/screenshots

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
