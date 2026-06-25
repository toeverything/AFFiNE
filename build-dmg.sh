#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

fail() {
  printf '\n[ERROR] %s\n' "$*" >&2
  exit 1
}

prompt_if_empty() {
  local var_name="$1"
  local prompt_text="$2"
  local secret="${3:-0}"
  local current="${!var_name:-}"

  if [[ -n "$current" ]]; then
    return 0
  fi

  if [[ "$secret" == "1" ]]; then
    read -r -s -p "$prompt_text: " current
    printf '\n'
  else
    read -r -p "$prompt_text: " current
  fi

  [[ -n "$current" ]] || fail "$var_name is required"
  export "$var_name=$current"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
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

list_codesign_identities() {
  local prefix="$1"
  security find-identity -v -p codesigning 2>/dev/null \
    | sed -n "s/.*\"\\(${prefix}:.*\\)\"/\\1/p"
}

pick_identity_from_list() {
  local identities="$1"
  local label="$2"

  [[ -n "$identities" ]] || fail "No '$label' certificate found in keychain"

  local count
  count="$(printf '%s\n' "$identities" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ "$count" == "1" ]]; then
    printf '%s\n' "$identities"
    return 0
  fi

  log "Multiple $label certificates found:" >&2
  local i=1
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    printf '  %s) %s\n' "$i" "$line" >&2
    i=$((i + 1))
  done <<< "$identities"

  local choice
  read -r -p "Choose certificate number: " choice
  [[ "$choice" =~ ^[0-9]+$ ]] || fail "Invalid certificate selection. Enter the number shown in the list, for example: 1"

  local selected
  selected="$(printf '%s\n' "$identities" | sed -n "${choice}p")"
  [[ -n "$selected" ]] || fail "Certificate selection out of range"
  printf '%s\n' "$selected"
}

resolve_codesign_identity() {
  local developer_id_identities
  developer_id_identities="$(list_codesign_identities 'Developer ID Application')"
  if [[ -n "$developer_id_identities" ]]; then
    pick_identity_from_list "$developer_id_identities" "Developer ID Application"
    return 0
  fi

  local apple_development_identities
  apple_development_identities="$(list_codesign_identities 'Apple Development')"
  if [[ -n "$apple_development_identities" ]]; then
    pick_identity_from_list "$apple_development_identities" "Apple Development"
    return 0
  fi

  fail "No supported macOS code signing certificate found in keychain (expected 'Developer ID Application' or 'Apple Development')"
}

signing_mode_from_identity() {
  case "$1" in
    Developer\ ID\ Application:*)
      printf 'developer-id\n'
      ;;
    Apple\ Development:*)
      printf 'apple-development\n'
      ;;
    *)
      fail "Unsupported APPLE_CODESIGN_IDENTITY: $1"
      ;;
  esac
}

ensure_node_version() {
  require_cmd node
  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$node_major" == "22" ]]; then
    return 0
  fi

  fail "Node 22 is required. Current: $(node -v). This repo expects package.json engines >=22.12.0 <23.0.0. Switch your shell to Node 22 first, then rerun this script."
}

ensure_yarn() {
  require_cmd corepack
  corepack enable >/dev/null 2>&1 || true
  require_cmd yarn
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
  unset SKIP_WEB_BUILD
  unset SKIP_GENERATE_ASSETS

  export RELEASE_VERSION="$(node -p 'require("./packages/frontend/apps/electron/package.json").version')"

  configure_electron_zip_cache "$repo_root"

  if [[ -z "${APPLE_CODESIGN_IDENTITY:-}" ]]; then
    export APPLE_CODESIGN_IDENTITY="$(resolve_codesign_identity)"
  fi

  local signing_mode
  signing_mode="$(signing_mode_from_identity "$APPLE_CODESIGN_IDENTITY")"

  if [[ "$signing_mode" == "developer-id" ]]; then
    prompt_if_empty APPLE_ID "Apple ID email"
    prompt_if_empty APPLE_PASSWORD "Apple app-specific password" 1
    prompt_if_empty APPLE_TEAM_ID "Apple Team ID"
  fi

  log "Using repository: $repo_root"
  log "Using BUILD_TYPE=$BUILD_TYPE"
  log "Using arch=$ELECTRON_ARCH"
  log "Using RELEASE_VERSION=$RELEASE_VERSION"
  log "Using identity=$APPLE_CODESIGN_IDENTITY"
  log "Using signing_mode=$signing_mode"

  FORGE_CONFIG_FILE="$repo_root/packages/frontend/apps/electron/forge.config.mjs"
  YARNRC_FILE="$repo_root/.yarnrc.yml"

  patch_forge_config "$FORGE_CONFIG_FILE"
  patch_yarnrc_for_packaging "$YARNRC_FILE"
  cleanup_electron_node_modules_symlink "$repo_root"

  log "Installing dependencies with packaging-compatible Yarn layout"
  yarn install

  log "Building native module"
  yarn affine @affine/native build

  log "Building Electron layers"
  yarn affine @affine/electron build

  log "Generating desktop assets"
  yarn affine @affine/electron generate-assets

  local product_name
  if [[ "$BUILD_TYPE" == "stable" ]]; then
    product_name="AFFiNE"
  else
    product_name="AFFiNE-$BUILD_TYPE"
  fi

  local app_path
  app_path="$repo_root/packages/frontend/apps/electron/out/$BUILD_TYPE/${product_name}-darwin-${ELECTRON_ARCH}/${product_name}.app"

  if [[ "$signing_mode" == "developer-id" ]]; then
    cleanup_stale_affine_mounts "$product_name"
    log "Making signed and notarized DMG"
    SKIP_WEB_BUILD=1 SKIP_GENERATE_ASSETS=1 yarn affine @affine/electron make --platform=darwin --arch="$ELECTRON_ARCH"

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

    log "Build complete"
    printf '\nDMG output:\n%s\n' "$dmg_path"
    return 0
  fi

  log "Packaging local Apple Development app"
  SKIP_WEB_BUILD=1 SKIP_GENERATE_ASSETS=1 yarn affine @affine/electron package --platform=darwin --arch="$ELECTRON_ARCH"

  [[ -d "$app_path" ]] || fail "Packaged app not found: $app_path"

  log "Validating Forge-signed local app signature"
  codesign --verify --deep --strict --verbose=4 "$app_path"

  log "Inspecting packaged app entitlements"
  if ! codesign -d --entitlements :- "$app_path" 2>/dev/null | grep -q 'com.apple.security.cs.allow-jit'; then
    fail "Packaged app is missing expected Electron JIT entitlements. Do not re-sign this app with bare codesign --deep."
  fi

  log "Removing quarantine attribute when present"
  xattr -dr com.apple.quarantine "$app_path" >/dev/null 2>&1 || true

  log "Assessing app with Gatekeeper (Apple Development builds are expected to be rejected)"
  if spctl -a -t exec -vv "$app_path"; then
    log "Gatekeeper accepted the local app"
  else
    log "Gatekeeper rejected the Apple Development build as expected"
  fi

  log "Build complete"
  printf '\nLocal app output:\n%s\n' "$app_path"
  printf 'If first launch is blocked, use Finder -> Open once on this Mac.\n'
}

main "$@"
