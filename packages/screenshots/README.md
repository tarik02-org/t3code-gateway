# README screenshots

This package regenerates the six screenshots in `.github/screenshots` with deterministic fake data.
It expects `packages/web/dist/client` to exist and never builds the web app itself.

## Local browser

Build the admin app, install Chromium once, then capture:

```sh
pnpm --filter @t3code-gateway/web build
pnpm screenshots:install
pnpm screenshots local
```

Use `--headful` to watch the capture or `--executable-path /path/to/chromium` to use an existing
Chromium binary.

## Existing CDP browser

```sh
pnpm screenshots cdp --cdp-url http://127.0.0.1:9222
```

The capture creates and closes its own page. It does not reuse or close pages already in the browser.

## Aperture

The Aperture mode creates a temporary no-snapshot Chromium session at DPR 2, captures through its
CDP endpoint, and deletes the session afterward.

```sh
APERTURE_BASE_URL=https://aperture.example.com \
APERTURE_TOKEN=apt_... \
pnpm screenshots aperture
```

Set `APERTURE_TENANT_ID` when using a system-admin token. Credentials can also be passed with
`--base-url`, `--token`, and `--tenant-id`.

## Output

All modes replace the PNG files in `.github/screenshots`. Pass `--output <directory>` to write
elsewhere.

The capture tool:

- serves the built admin app through an in-browser virtual origin
- handles gateway calls with typed Effect RPC fixtures
- prepares each view with a complete Effect fixture
- derives viewport heights from rendered page or dialog content

`effect-playwright` is vendored from the build documented in [vendor/README.md](vendor/README.md).
