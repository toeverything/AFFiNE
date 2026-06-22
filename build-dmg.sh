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

pick_codesign_identity() {
  local identities
  identities="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Developer ID Application:.*\)"/\1/p')"

  [[ -n "$identities" ]] || fail "No 'Developer ID Application' certificate found in keychain"

  local count
  count="$(printf '%s\n' "$identities" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ "$count" == "1" ]]; then
    printf '%s\n' "$identities"
    return 0
  fi

  log "Multiple Developer ID Application certificates found:"
  local i=1
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    printf '  %s) %s\n' "$i" "$line"
    i=$((i + 1))
  done <<< "$identities"

  local choice
  read -r -p "Choose certificate number: " choice
  [[ "$choice" =~ ^[0-9]+$ ]] || fail "Invalid certificate selection"

  local selected
  selected="$(printf '%s\n' "$identities" | sed -n "${choice}p")"
  [[ -n "$selected" ]] || fail "Certificate selection out of range"
  printf '%s\n' "$selected"
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
seen_nm_hoisting = False
for line in lines:
    if line.startswith('nmMode:'):
        result.append('nmMode: classic')
        seen_nm_mode = True
    elif line.startswith('nmHoistingLimits:'):
        result.append('nmHoistingLimits: workspaces')
        seen_nm_hoisting = True
    else:
        result.append(line)
if not seen_nm_mode:
    result.append('nmMode: classic')
if not seen_nm_hoisting:
    result.append('nmHoistingLimits: workspaces')
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

  if [[ -z "${APPLE_CODESIGN_IDENTITY:-}" ]]; then
    export APPLE_CODESIGN_IDENTITY="$(pick_codesign_identity)"
  fi

  prompt_if_empty APPLE_ID "Apple ID email"
  prompt_if_empty APPLE_PASSWORD "Apple app-specific password" 1
  prompt_if_empty APPLE_TEAM_ID "Apple Team ID"

  log "Using repository: $repo_root"
  log "Using BUILD_TYPE=$BUILD_TYPE"
  log "Using arch=$ELECTRON_ARCH"
  log "Using RELEASE_VERSION=$RELEASE_VERSION"
  log "Using identity=$APPLE_CODESIGN_IDENTITY"

  FORGE_CONFIG_FILE="$repo_root/packages/frontend/apps/electron/forge.config.mjs"
  YARNRC_FILE="$repo_root/.yarnrc.yml"

  patch_forge_config "$FORGE_CONFIG_FILE"
  patch_yarnrc_for_packaging "$YARNRC_FILE"

  log "Installing dependencies with packaging-compatible Yarn layout"
  yarn install

  log "Building native module"
  yarn affine @affine/native build

  log "Building Electron layers"
  yarn affine @affine/electron build

  log "Generating desktop assets"
  yarn affine @affine/electron generate-assets

  log "Making signed and notarized DMG"
  SKIP_WEB_BUILD=1 SKIP_GENERATE_ASSETS=1 yarn affine @affine/electron make --platform=darwin --arch="$ELECTRON_ARCH"

  local product_name
  if [[ "$BUILD_TYPE" == "stable" ]]; then
    product_name="AFFiNE"
  else
    product_name="AFFiNE-$BUILD_TYPE"
  fi

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

  log "Build complete"
  printf '\nDMG output:\n%s\n' "$dmg_path"
}

main "$@"
