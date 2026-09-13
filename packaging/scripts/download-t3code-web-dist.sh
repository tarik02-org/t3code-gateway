#!/usr/bin/env sh
set -eu

root_dir="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
stable_version="2026.9.700"
stable_release_tag="v${stable_version}"
stable_asset_sha256="9d97a8b9c3000af00d6d4c1f27a5ba1b93e937ce52e9c269b6cef90ff22e5ba0"
nightly_version="2026.8.2901-nightly.20260907.483"
nightly_release_tag="v${nightly_version}"
nightly_asset_sha256="03f9e832cd57c2d14dc7f0c9e9d11f612276e93c63fbfe8838ac3d8d7865f22b"
runtime_dir="${root_dir}/packaging/runtime"
dist_root="${runtime_dir}/t3code-web-dist"

download_channel() {
  channel="$1"
  version="$2"
  release_tag="$3"
  asset_sha256="$4"
  asset_name="T3-Code-Web-${version}.zip"
  archive_path="${runtime_dir}/${asset_name}"
  extract_tmp="${runtime_dir}/.t3code-web-dist-${channel}"
  dist_dir="${dist_root}/${channel}"

  rm -rf "${archive_path}" "${extract_tmp}" "${dist_dir}"
  mkdir -p "${extract_tmp}"

  curl -fsSL "https://github.com/tarik02-org/t3code/releases/download/${release_tag}/${asset_name}" -o "${archive_path}"
  printf "%s  %s\n" "${asset_sha256}" "${archive_path}" | sha256sum -c -
  if command -v unzip >/dev/null 2>&1; then
    unzip -q "${archive_path}" -d "${extract_tmp}"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -m zipfile -e "${archive_path}" "${extract_tmp}"
  else
    echo "unzip or python3 is required to extract ${asset_name}" >&2
    exit 1
  fi

  if [ -f "${extract_tmp}/index.html" ]; then
    mv "${extract_tmp}" "${dist_dir}"
  else
    entry_count="$(find "${extract_tmp}" -mindepth 1 -maxdepth 1 | wc -l)"
    entry_path="$(find "${extract_tmp}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
    if [ "${entry_count}" -eq 1 ] && [ -n "${entry_path}" ] && [ -f "${entry_path}/index.html" ]; then
      mv "${entry_path}" "${dist_dir}"
      rmdir "${extract_tmp}"
    else
      echo "downloaded T3 Code web dist does not contain index.html at the expected location" >&2
      exit 1
    fi
  fi

  find "${dist_dir}" -type f -name '*.map' -exec rm -f {} +
  printf "%s\n" "${version}" >"${dist_dir}/version.txt"
  rm -f "${archive_path}"
}

rm -rf "${dist_root}"
mkdir -p "${dist_root}"
download_channel stable "${stable_version}" "${stable_release_tag}" "${stable_asset_sha256}"
download_channel nightly "${nightly_version}" "${nightly_release_tag}" "${nightly_asset_sha256}"
