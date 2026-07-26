#!/usr/bin/env sh
set -eu

root_dir="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
version="2026.7.101-nightly.20260705.353"
release_tag="v${version}"
asset_name="T3-Code-Web-${version}.zip"
asset_sha256="d7fe7b4889bc039852475c86bb6046c736c2f23b819e220dd8bb2accfb037c69"
runtime_dir="${root_dir}/packaging/runtime"
archive_path="${runtime_dir}/${asset_name}"
extract_tmp="${runtime_dir}/.t3code-web-dist"
dist_dir="${runtime_dir}/t3code-web-dist"

rm -rf "${archive_path}" "${extract_tmp}" "${dist_dir}"
mkdir -p "${extract_tmp}"

curl -fsSL "https://github.com/tarik02/t3code/releases/download/${release_tag}/${asset_name}" -o "${archive_path}"
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
rm -f "${archive_path}"
