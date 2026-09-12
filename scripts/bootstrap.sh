#!/usr/bin/env bash
set -euo pipefail

node_version="22.23.2"
platform="$(uname -s)"
arch="$(uname -m)"
if [[ "${platform}" != "Darwin" || "${arch}" != "arm64" ]]; then
  echo "Keeptrail bootstrap currently supports macOS arm64 only (found ${platform} ${arch})." >&2
  exit 1
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_root="${KEEPTRAIL_NODE_ROOT:-${HOME}/.keeptrail}"
node_dir="${install_root}/node-v${node_version}-darwin-arm64"
node_bin="${node_dir}/bin/node"

if [[ ! -x "${node_bin}" || "$("${node_bin}" --version)" != "v${node_version}" ]]; then
  mkdir -p "${install_root}"
  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/keeptrail-node.XXXXXX")"
  trap 'rm -rf "${tmp_dir}"' EXIT
  archive="node-v${node_version}-darwin-arm64.tar.gz"
  base_url="https://nodejs.org/dist/v${node_version}"
  curl --fail --location --silent --show-error --output "${tmp_dir}/${archive}" "${base_url}/${archive}"
  curl --fail --location --silent --show-error --output "${tmp_dir}/SHASUMS256.txt" "${base_url}/SHASUMS256.txt"
  curl --fail --location --silent --show-error --output "${tmp_dir}/SHASUMS256.txt.sig" "${base_url}/SHASUMS256.txt.sig"
  checksum="$(awk -v file="${archive}" '$2 == file { print $1 }' "${tmp_dir}/SHASUMS256.txt")"
  [[ "${#checksum}" -eq 64 ]] || { echo "Node archive checksum was not found in the official SHASUMS file." >&2; exit 1; }
  printf '%s  %s\n' "${checksum}" "${tmp_dir}/${archive}" | shasum -a 256 -c -
  echo "Downloaded the official SHASUMS signature alongside the archive: ${tmp_dir}/SHASUMS256.txt.sig"
  rm -rf "${node_dir}"
  tar -xzf "${tmp_dir}/${archive}" -C "${install_root}"
fi

export PATH="${node_dir}/bin:${PATH}"
cd "${repo_dir}"
node --version
npm --version
npm install
npm run build
npm run setup
echo "Keeptrail is ready. Run: ${repo_dir}/scripts/keeptrail start"
