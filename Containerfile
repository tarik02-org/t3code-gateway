# syntax=docker/dockerfile:1.7

ARG ALPINE_VERSION=3.23
ARG NODE_VERSION=24.13.1

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS node-runtime

FROM --platform=$BUILDPLATFORM alpine:${ALPINE_VERSION} AS runtime-assets

ARG TARGETARCH
ARG S6_OVERLAY_VERSION=3.2.3.0
ARG TRAEFIK_VERSION=3.7.6

RUN apk add --no-cache curl xz

RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64) s6_arch="x86_64" ;; \
    arm64) s6_arch="aarch64" ;; \
    *) echo "unsupported target architecture: ${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  mkdir -p /rootfs; \
  curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" -o /tmp/s6-overlay-noarch.tar.xz; \
  curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${s6_arch}.tar.xz" -o /tmp/s6-overlay-arch.tar.xz; \
  tar -C /rootfs -Jxpf /tmp/s6-overlay-noarch.tar.xz; \
  tar -C /rootfs -Jxpf /tmp/s6-overlay-arch.tar.xz; \
  rm -f /tmp/s6-overlay-noarch.tar.xz /tmp/s6-overlay-arch.tar.xz

RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64) traefik_arch="amd64" ;; \
    arm64) traefik_arch="arm64" ;; \
    *) echo "unsupported target architecture: ${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  mkdir -p /rootfs/usr/local/bin; \
  curl -fsSL "https://github.com/traefik/traefik/releases/download/v${TRAEFIK_VERSION}/traefik_v${TRAEFIK_VERSION}_linux_${traefik_arch}.tar.gz" -o /tmp/traefik.tar.gz; \
  tar -C /rootfs/usr/local/bin -xzf /tmp/traefik.tar.gz traefik; \
  chmod +x /rootfs/usr/local/bin/traefik; \
  rm -f /tmp/traefik.tar.gz

FROM alpine:${ALPINE_VERSION}

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/lib/libgcc_s.so.1 /usr/lib/libgcc_s.so.1
COPY --from=node-runtime /usr/lib/libstdc++.so.6* /usr/lib/
COPY --from=node-runtime /etc/ssl/ /etc/ssl/
COPY --from=runtime-assets /rootfs/ /

WORKDIR /opt/t3code-gateway

COPY packaging/runtime/app/ /opt/t3code-gateway/
COPY --chmod=755 packaging/container/s6/gateway/run /etc/s6-overlay/s6-rc.d/gateway/run
COPY packaging/container/s6/gateway/type /etc/s6-overlay/s6-rc.d/gateway/type
COPY --chmod=755 packaging/container/s6/traefik/run /etc/s6-overlay/s6-rc.d/traefik/run
COPY packaging/container/s6/traefik/type /etc/s6-overlay/s6-rc.d/traefik/type
COPY packaging/container/s6/user /etc/s6-overlay/s6-rc.d/user
COPY packaging/container/traefik/traefik.yml /etc/traefik/traefik.yml

ENV NODE_ENV=production
ENV S6_KEEP_ENV=1
ENV T3_GATEWAY_BUNDLED_TRAEFIK_ENABLED=false
ENV T3_GATEWAY_LISTEN_HOST=0.0.0.0
ENV T3_GATEWAY_LISTEN_PORT=8787

VOLUME ["/data"]
EXPOSE 80 443 8787

ENTRYPOINT ["/init"]
