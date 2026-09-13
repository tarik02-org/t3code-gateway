# T3 Code Gateway

T3 Code Gateway manages multiple self-hosted T3 Code environments behind one public entry point.
It provides an admin UI, optional T3 Code Web, Traefik routes, encrypted environment credentials,
pairing links, and client session controls.

Normal T3 Code traffic goes directly from Traefik to each configured environment. The gateway only
manages configuration, credentials, and access.

## Screenshots

### Environment management

![Gateway admin showing example environments](.github/screenshots/admin-environments.png)

![Add environment dialog](.github/screenshots/add-environment.png)

![Edit environment dialog](.github/screenshots/edit-environment.png)

### T3 Code Web

![Add an environment to T3 Code Web](.github/screenshots/web-enrollment.png)

### Pairing and access

![Pairing link permissions](.github/screenshots/pairing-link.png)

![Authorized clients](.github/screenshots/authorized-clients.png)

See [the screenshot package](packages/screenshots/README.md) to regenerate them.

## Run

Images are published to `ghcr.io/tarik02-org/t3code-gateway`.

```sh
docker run \
  --name t3code-gateway \
  --restart unless-stopped \
  -p 8787:8787 \
  -v t3code-gateway-data:/data \
  -e T3_GATEWAY_PUBLIC_BASE_DOMAIN=code.example.com \
  ghcr.io/tarik02-org/t3code-gateway:<version>
```

Open `/admin/login`. On first start, the gateway logs the generated password for the `admin` user.

The image includes both stable and nightly T3 Code Web builds. After signing in, use the `T3 Code
Versions` button to switch channels, pin versions, collect unused downloads, enable automatic
updates, or check for an update immediately.
GitHub-backed automatic updates are disabled by default; downloaded builds are stored in the gateway
data volume.

Use an external Traefik instance with `/data/traefik/environments.yml`, or enable the bundled one
with `T3_GATEWAY_BUNDLED_TRAEFIK_ENABLED=true` and expose ports `80` and `443`.

## Development

```sh
pnpm install
pnpm build
```

### PR container images

Add the `build-image` label to a same-repository pull request to build and publish
`ghcr.io/tarik02-org/t3code-gateway:pr-<number>` without merging it. The image is
rebuilt for every subsequent push while the label remains attached, and the workflow
updates a pull request comment with the image reference. Fork pull requests are skipped.

## License

MIT
