#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

fail() {
  printf '\n[ERROR] %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_env() {
  local var_name="$1"
  [[ -n "${!var_name:-}" ]] || fail "$var_name is required"
}

find_repo_root() {
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    git rev-parse --show-toplevel
    return 0
  fi

  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -d "$script_dir/.git" ]]; then
    printf '%s\n' "$script_dir"
    return 0
  fi

  fail "Please run this script inside the AFFiNE repository"
}

detect_arch() {
  local machine
  machine="$(uname -m)"
  case "$machine" in
    arm64|aarch64)
      printf 'arm64\n'
      ;;
    x86_64)
      printf 'x64\n'
      ;;
    *)
      fail "Unsupported macOS architecture: $machine"
      ;;
  esac
}

ensure_node_version() {
  require_cmd node
  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  [[ "$node_major" == "22" ]] || fail "Node 22 is required. Current: $(node -v)"
}

ensure_yarn() {
  require_cmd corepack
  corepack enable >/dev/null 2>&1 || true
  require_cmd yarn
}

ensure_local_ai_runtime() {
  local repo_root="$1"

  if [[ "$ELECTRON_ARCH" != "arm64" ]]; then
    return 0
  fi

  require_cmd brew
  log "Installing local AI runtime build dependencies"
  brew install libomp openssl@3

  local local_ai_libomp_root
  local_ai_libomp_root="$(brew --prefix libomp)"
  local local_ai_openssl_root
  local_ai_openssl_root="$(brew --prefix openssl@3)"

  export LOCAL_AI_LIBOMP_ROOT="$local_ai_libomp_root"
  export LOCAL_AI_OPENSSL_ROOT="$local_ai_openssl_root"
  export LOCAL_AI_RUNTIME_SOURCE_ROOT="$repo_root/.cache/local-ai-runtime/darwin-arm64"
  log "Preparing local AI runtime from source"
  node "$repo_root/packages/frontend/apps/electron/scripts/prepare-local-ai-runtime.mjs"
}

configure_electron_zip_cache() {
  local repo_root="$1"
  local cache_dir="$repo_root/.cache/electron-zips"

  if [[ -n "${ELECTRON_FORGE_ELECTRON_ZIP_DIR:-}" ]]; then
    log "Using preconfigured Electron zip cache: $ELECTRON_FORGE_ELECTRON_ZIP_DIR"
    return 0
  fi

  local electron_version
  electron_version="$(node -p 'require("electron/package.json").version')"

  local expected_zip="$cache_dir/electron-v${electron_version}-darwin-${ELECTRON_ARCH}.zip"
  if [[ -f "$expected_zip" ]]; then
    export ELECTRON_FORGE_ELECTRON_ZIP_DIR="$cache_dir"
    log "Using local Electron zip cache: $expected_zip"
    return 0
  fi

  log "Local Electron zip cache not found at $expected_zip; Forge may fall back to network download"
}

backup_file() {
  local file="$1"
  cp "$file" "$file.cursor-backup"
}

restore_file_if_backed_up() {
  local file="$1"
  if [[ -f "$file.cursor-backup" ]]; then
    mv "$file.cursor-backup" "$file"
  fi
}

cleanup_electron_node_modules_symlink() {
  local electron_node_modules="$1/packages/frontend/apps/electron/node_modules"

  if [[ -L "$electron_node_modules" ]]; then
    rm "$electron_node_modules"
  fi
}

cleanup_stale_dmg_mount() {
  local mount_path="$1"

  if [[ ! -d "$mount_path" ]]; then
    return 0
  fi

  log "Detaching stale DMG mount: $mount_path"
  if hdiutil detach "$mount_path" >/dev/null 2>&1; then
    return 0
  fi

  log "Retrying stale DMG mount detach with force: $mount_path"
  hdiutil detach -force "$mount_path" >/dev/null 2>&1 || true
}

cleanup_stale_affine_mounts() {
  local product_name="$1"

  for volume_name in "AFFiNE" "$product_name"; do
    for suffix in '' ' 1' ' 2' ' 3' ' 4' ' 5' ' 6' ' 7' ' 8' ' 9'; do
      cleanup_stale_dmg_mount "/Volumes/${volume_name}${suffix}"
    done
  done
}

cleanup() {
  set +e
  if [[ -n "${FORGE_CONFIG_FILE:-}" ]]; then
    restore_file_if_backed_up "$FORGE_CONFIG_FILE"
  fi
  if [[ -n "${YARNRC_FILE:-}" ]]; then
    restore_file_if_backed_up "$YARNRC_FILE"
  fi
  if [[ -n "${TEMP_KEYCHAIN_NAME:-}" ]]; then
    security delete-keychain "$TEMP_KEYCHAIN_NAME" >/dev/null 2>&1 || true
  fi
  if [[ -n "${TEMP_CERT_P12_FILE:-}" ]]; then
    rm -f "$TEMP_CERT_P12_FILE"
  fi
}

trap cleanup EXIT

patch_forge_config() {
  local file="$1"
  backup_file "$file"

  python3 - "$file" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
needle = "identity: 'Developer ID Application: TOEVERYTHING PTE. LTD.',"
replacement = "identity:\n        process.env.APPLE_CODESIGN_IDENTITY ||\n        'Developer ID Application: TOEVERYTHING PTE. LTD.',"
legacy_replacement = "identity: process.env.APPLE_CODESIGN_IDENTITY,"
if needle not in text and replacement not in text and legacy_replacement not in text:
    raise SystemExit("Could not find hardcoded osxSign identity in forge.config.mjs")
if legacy_replacement in text:
    text = text.replace(legacy_replacement, replacement, 1)
elif needle in text:
    text = text.replace(needle, replacement, 1)
path.write_text(text)
PY
}

patch_yarnrc_for_packaging() {
  local file="$1"
  backup_file "$file"

  python3 - "$file" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
lines = text.splitlines()
result = []
seen_nm_mode = False
for line in lines:
    if line.startswith('nmMode:'):
        result.append('nmMode: classic')
        seen_nm_mode = True
    elif line.startswith('nmHoistingLimits:'):
        continue
    else:
        result.append(line)
if not seen_nm_mode:
    result.append('nmMode: classic')
path.write_text('\n'.join(result) + '\n')
PY
}

import_certificate_if_needed() {
  if [[ -z "${APPLE_CERT_P12_BASE64:-}" ]]; then
    log "APPLE_CERT_P12_BASE64 not set, assuming certificate is already in keychain"
    return 0
  fi

  require_env APPLE_CERT_P12_PASSWORD
  require_env KEYCHAIN_PASSWORD

  TEMP_KEYCHAIN_NAME="affine-build.keychain-db"
  local keychain_path="$HOME/Library/Keychains/$TEMP_KEYCHAIN_NAME"
  TEMP_CERT_P12_FILE="$(mktemp /tmp/affine-cert.XXXXXX.p12)"

  log "Creating temporary keychain"
  security create-keychain -p "$KEYCHAIN_PASSWORD" "$TEMP_KEYCHAIN_NAME"
  security set-keychain-settings -lut 21600 "$TEMP_KEYCHAIN_NAME"
  security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$TEMP_KEYCHAIN_NAME"

  log "Adding temporary keychain to search list"
  local current_keychains
  current_keychains="$(security list-keychains -d user | tr -d '"')"
  security list-keychains -d user -s "$keychain_path" $current_keychains
  security default-keychain -d user -s "$keychain_path"

  log "Importing Developer ID certificate into temporary keychain"
  APPLE_CERT_P12_BASE64="$APPLE_CERT_P12_BASE64" python3 - "$TEMP_CERT_P12_FILE" <<'PY'
import base64
import os
import sys

with open(sys.argv[1], 'wb') as f:
    f.write(base64.b64decode(os.environ['APPLE_CERT_P12_BASE64']))
PY
  security import "$TEMP_CERT_P12_FILE" -k "$keychain_path" -P "$APPLE_CERT_P12_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$keychain_path" >/dev/null
  rm -f "$TEMP_CERT_P12_FILE"
  unset TEMP_CERT_P12_FILE
}

resolve_codesign_identity() {
  if [[ -n "${APPLE_CODESIGN_IDENTITY:-}" ]]; then
    return 0
  fi

  local found
  found="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Developer ID Application:.*\)"/\1/p' | head -n 1)"
  [[ -n "$found" ]] || fail "APPLE_CODESIGN_IDENTITY is not set and no Developer ID Application certificate was found"
  export APPLE_CODESIGN_IDENTITY="$found"
}

main() {
  require_cmd git
  require_cmd security
  require_cmd python3
  require_cmd xcodebuild
  require_cmd xcrun
  require_cmd codesign
  require_cmd spctl
  require_cmd cargo
  require_cmd cmake
  require_cmd base64

  local repo_root
  repo_root="$(find_repo_root)"
  cd "$repo_root"

  [[ -f package.json ]] || fail "Not at AFFiNE repository root"
  [[ -f packages/frontend/apps/electron/forge.config.mjs ]] || fail "Electron forge config not found"

  ensure_node_version
  ensure_yarn

  export BUILD_TYPE="${BUILD_TYPE:-stable}"
  export ELECTRON_ARCH="${ELECTRON_ARCH:-$(detect_arch)}"
  export HOIST_NODE_MODULES=1
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=14384}"
  export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-12.0}"
  export RELEASE_VERSION="${RELEASE_VERSION:-$(node -p 'require("./packages/frontend/apps/electron/package.json").version')}"
  unset SKIP_WEB_BUILD
  unset SKIP_GENERATE_ASSETS

  require_env APPLE_ID
  require_env APPLE_PASSWORD
  require_env APPLE_TEAM_ID

  import_certificate_if_needed
  resolve_codesign_identity

  log "Using repository: $repo_root"
  log "Using BUILD_TYPE=$BUILD_TYPE"
  log "Using arch=$ELECTRON_ARCH"
  log "Using RELEASE_VERSION=$RELEASE_VERSION"
  log "Using identity=$APPLE_CODESIGN_IDENTITY"

  FORGE_CONFIG_FILE="$repo_root/packages/frontend/apps/electron/forge.config.mjs"
  YARNRC_FILE="$repo_root/.yarnrc.yml"

  patch_forge_config "$FORGE_CONFIG_FILE"
  patch_yarnrc_for_packaging "$YARNRC_FILE"
  cleanup_electron_node_modules_symlink "$repo_root"

  log "Installing dependencies with packaging-compatible Yarn layout"
  yarn install

  configure_electron_zip_cache "$repo_root"

  log "Building native module"
  yarn affine @affine/native build

  ensure_local_ai_runtime "$repo_root"

  if [[ "${SKIP_DESKTOP_WEB_BUILD:-0}" == "1" ]]; then
    [[ -d "$repo_root/packages/frontend/apps/electron/resources/web-static" ]] || fail "SKIP_DESKTOP_WEB_BUILD=1 requires packages/frontend/apps/electron/resources/web-static to already exist"
    log "Skipping desktop web asset generation because SKIP_DESKTOP_WEB_BUILD=1"
    log "Building Electron layers"
    yarn affine @affine/electron build
  else
    log "Building Electron layers and generating desktop assets"
    yarn affine @affine/electron build
    yarn affine @affine/electron generate-assets
  fi

  local product_name
  if [[ "$BUILD_TYPE" == "stable" ]]; then
    product_name="AFFiNE"
  else
    product_name="AFFiNE-$BUILD_TYPE"
  fi

  cleanup_stale_affine_mounts "$product_name"
  log "Making signed and notarized DMG"
  SKIP_WEB_BUILD=1 SKIP_GENERATE_ASSETS=1 yarn affine @affine/electron make --platform=darwin --arch="$ELECTRON_ARCH"

  local app_path
  app_path="$repo_root/packages/frontend/apps/electron/out/$BUILD_TYPE/${product_name}-darwin-${ELECTRON_ARCH}/${product_name}.app"

  local dmg_path
  dmg_path="$repo_root/packages/frontend/apps/electron/out/$BUILD_TYPE/make/AFFiNE.dmg"

  [[ -d "$app_path" ]] || fail "Signed app not found: $app_path"
  [[ -f "$dmg_path" ]] || fail "DMG not found: $dmg_path"

  log "Signing DMG container"
  codesign --force --sign "$APPLE_CODESIGN_IDENTITY" "$dmg_path"

  log "Stapling app"
  xcrun stapler staple "$app_path"

  log "Stapling DMG"
  xcrun stapler staple "$dmg_path"

  log "Validating app with Gatekeeper"
  spctl -a -t exec -vv "$app_path"

  log "Validating stapled app"
  xcrun stapler validate "$app_path"

  log "Validating stapled DMG"
  xcrun stapler validate "$dmg_path"

  mkdir -p "$repo_root/builds"
  local final_dmg_path
  final_dmg_path="$repo_root/builds/affine-${RELEASE_VERSION}-${BUILD_TYPE}-macos-${ELECTRON_ARCH}.dmg"
  cp "$dmg_path" "$final_dmg_path"

  log "CI build complete"
  printf '\nDMG output:\n%s\n' "$final_dmg_path"
}

main "$@"
