#!/usr/bin/env bash
set -euo pipefail

# Zero-edit defaults. In the common case you can run this script directly and answer the prompts.
# Every value here can still be overridden via environment variables if you want a non-interactive run.
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-toeverything/AFFiNE}"
RUNNER_DIR="${RUNNER_DIR:-$HOME/actions-runner-affine}"
RUNNER_NAME="${RUNNER_NAME:-$(scutil --get ComputerName 2>/dev/null || hostname)-affine-signing}"
RUNNER_LABEL="${RUNNER_LABEL:-affine-macos-signing}"
RUNNER_WORK_DIR="${RUNNER_WORK_DIR:-_work}"
RUNNER_GROUP="${RUNNER_GROUP:-}"

APPLE_ID="${APPLE_ID:-}"
APPLE_PASSWORD="${APPLE_PASSWORD:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_CODESIGN_IDENTITY="${APPLE_CODESIGN_IDENTITY:-}"
RUNNER_ENV_PATH="${RUNNER_ENV_PATH:-/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin}"

RUNNER_TGZ_URL_OVERRIDE="${RUNNER_TGZ_URL_OVERRIDE:-}"
RUNNER_TOKEN_OVERRIDE="${RUNNER_TOKEN_OVERRIDE:-}"
P12_FILE="${P12_FILE:-}"
P12_PASSWORD="${P12_PASSWORD:-}"
LOGIN_KEYCHAIN_PASSWORD="${LOGIN_KEYCHAIN_PASSWORD:-}"

VERIFY_NOTARYTOOL="${VERIFY_NOTARYTOOL:-true}"
INSTALL_AND_START_SERVICE="${INSTALL_AND_START_SERVICE:-true}"
CHECK_RUNNER_ONLINE="${CHECK_RUNNER_ONLINE:-true}"
PROMPT_RELEASE_TRIGGER="${PROMPT_RELEASE_TRIGGER:-true}"
OPEN_BROWSER_WHEN_NEEDED="${OPEN_BROWSER_WHEN_NEEDED:-true}"
RELEASE_REF="${RELEASE_REF:-}"
KEYCHAIN_PATH="${KEYCHAIN_PATH:-$HOME/Library/Keychains/login.keychain-db}"

RUNNER_STATUS=""
RELEASE_TRIGGERED="false"

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

fail() {
  printf '\n[ERROR] %s\n' "$*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

require_cmd() {
  command_exists "$1" || fail "Missing required command: $1"
}

is_true() {
  [[ "$1" == "true" || "$1" == "TRUE" || "$1" == "1" || "$1" == "yes" || "$1" == "YES" ]]
}

prompt_value_if_empty() {
  local var_name="$1"
  local prompt_text="$2"
  local default_value="${3:-}"
  local input=""

  if [[ -n "${!var_name:-}" ]]; then
    return 0
  fi

  if [[ -n "$default_value" ]]; then
    read -r -p "$prompt_text [$default_value]: " input
    input="${input:-$default_value}"
  else
    read -r -p "$prompt_text: " input
  fi

  [[ -n "$input" ]] || fail "$var_name cannot be empty"
  printf -v "$var_name" '%s' "$input"
  export "$var_name"
}

prompt_secret_if_empty() {
  local var_name="$1"
  local prompt_text="$2"
  local input=""

  if [[ -n "${!var_name:-}" ]]; then
    return 0
  fi

  read -r -s -p "$prompt_text: " input
  echo
  [[ -n "$input" ]] || fail "$var_name cannot be empty"
  printf -v "$var_name" '%s' "$input"
  export "$var_name"
}

prompt_yes_no() {
  local prompt_text="$1"
  local default_answer="${2:-yes}"
  local answer=""

  while true; do
    if [[ "$default_answer" == "yes" ]]; then
      read -r -p "$prompt_text [Y/n]: " answer
      answer="${answer:-y}"
    else
      read -r -p "$prompt_text [y/N]: " answer
      answer="${answer:-n}"
    fi

    case "$answer" in
      y|Y|yes|YES)
        return 0
        ;;
      n|N|no|NO)
        return 1
        ;;
      *)
        printf 'Please answer y or n.\n'
        ;;
    esac
  done
}

ensure_macos() {
  [[ "$(uname -s)" == "Darwin" ]] || fail "This script only supports macOS"
}

ensure_xcode_cli() {
  xcode-select -p >/dev/null 2>&1 || fail "Xcode Command Line Tools are required. Run: xcode-select --install"
}

detect_runner_arch() {
  case "$(uname -m)" in
    arm64|aarch64)
      printf 'arm64\n'
      ;;
    x86_64)
      printf 'x64\n'
      ;;
    *)
      fail "Unsupported macOS architecture: $(uname -m)"
      ;;
  esac
}

repo_html_url() {
  printf 'https://github.com/%s\n' "$GITHUB_REPOSITORY"
}

runner_setup_url() {
  printf '%s/settings/actions/runners/new\n' "$(repo_html_url)"
}

release_workflow_url() {
  printf '%s/actions/workflows/release.yml\n' "$(repo_html_url)"
}

open_url() {
  local url="$1"

  if ! is_true "$OPEN_BROWSER_WHEN_NEEDED"; then
    return 0
  fi

  if command_exists open; then
    open "$url" >/dev/null 2>&1 || true
  fi
}

command_exists_gh() {
  command_exists gh
}

can_use_gh_api() {
  command_exists_gh && gh auth status >/dev/null 2>&1
}

can_use_gh_runner_api() {
  can_use_gh_api && gh api "repos/$GITHUB_REPOSITORY/actions/runners/downloads" >/dev/null 2>&1
}

install_gh_with_brew() {
  if command_exists_gh; then
    return 0
  fi

  if ! command_exists brew; then
    return 1
  fi

  log "GitHub CLI is not installed"
  if ! prompt_yes_no "Install GitHub CLI with Homebrew now?" yes; then
    return 1
  fi

  brew install gh
  hash -r
  command_exists_gh || fail "GitHub CLI installation completed but 'gh' is still unavailable"
}

ensure_gh_auth_or_manual_fallback() {
  if can_use_gh_runner_api; then
    return 0
  fi

  install_gh_with_brew || true

  if can_use_gh_runner_api; then
    return 0
  fi

  if command_exists_gh; then
    if ! can_use_gh_api; then
      log "GitHub CLI is available but not authenticated"
      if prompt_yes_no "Run 'gh auth login' now so the script can fetch runner metadata and optionally trigger the release workflow automatically?" yes; then
        gh auth login || true
        if can_use_gh_runner_api; then
          return 0
        fi
      else
        log "Skipping gh auth login, falling back to manual runner values"
      fi
    fi

    if can_use_gh_api; then
      log "GitHub CLI is authenticated, but this account/token does not have repository runner API permission for $GITHUB_REPOSITORY"
      log "Falling back to manual runner values from the GitHub web page"
    else
      log "GitHub CLI is still not authenticated, falling back to manual runner values"
    fi
  else
    log "GitHub CLI is unavailable, falling back to manual runner values"
  fi

  log "Opening the GitHub self-hosted runner page so you can copy the runner download URL and registration token"
  open_url "$(runner_setup_url)"

  prompt_value_if_empty RUNNER_TGZ_URL_OVERRIDE "Paste the runner download URL from GitHub -> Settings -> Actions -> Runners -> New self-hosted runner"
  prompt_value_if_empty RUNNER_TOKEN_OVERRIDE "Paste the short-lived runner registration token from the same GitHub page"
}

collect_notarization_inputs() {
  log "Collecting Apple notarization account inputs"
  prompt_value_if_empty APPLE_ID "Apple ID email used for notarization"
  prompt_secret_if_empty APPLE_PASSWORD "Apple app-specific password"
  prompt_value_if_empty APPLE_TEAM_ID "Apple Team ID"
}

fetch_runner_download_url() {
  local arch="$1"

  if [[ -n "$RUNNER_TGZ_URL_OVERRIDE" ]]; then
    printf '%s\n' "$RUNNER_TGZ_URL_OVERRIDE"
    return 0
  fi

  can_use_gh_runner_api || fail "Runner API is unavailable and RUNNER_TGZ_URL_OVERRIDE was not provided"

  gh api "repos/$GITHUB_REPOSITORY/actions/runners/downloads" \
    --jq ".[] | select(.os == \"osx\" and .architecture == \"$arch\") | .download_url" \
    | head -n 1
}

fetch_runner_registration_token() {
  if [[ -n "$RUNNER_TOKEN_OVERRIDE" ]]; then
    printf '%s\n' "$RUNNER_TOKEN_OVERRIDE"
    return 0
  fi

  can_use_gh_runner_api || fail "Runner API is unavailable and RUNNER_TOKEN_OVERRIDE was not provided"

  gh api -X POST "repos/$GITHUB_REPOSITORY/actions/runners/registration-token" --jq '.token'
}

prepare_runner_dir() {
  if [[ -f "$RUNNER_DIR/.runner" || -f "$RUNNER_DIR/.credentials" ]]; then
    fail "Runner already configured in $RUNNER_DIR. Remove it or change RUNNER_DIR/RUNNER_NAME before rerunning."
  fi

  mkdir -p "$RUNNER_DIR"
}

download_runner_if_needed() {
  local download_url="$1"
  local archive_path="$RUNNER_DIR/actions-runner.tar.gz"

  [[ -n "$download_url" ]] || fail "Could not resolve the runner download URL"

  if [[ -f "$RUNNER_DIR/config.sh" && -f "$RUNNER_DIR/run.sh" ]]; then
    log "Runner files already exist, skipping download"
    return 0
  fi

  log "Downloading GitHub Actions runner"
  curl -L "$download_url" -o "$archive_path"

  log "Extracting runner package"
  tar xzf "$archive_path" -C "$RUNNER_DIR"
  rm -f "$archive_path"
}

configure_runner() {
  local token="$1"
  local repo_url="https://github.com/$GITHUB_REPOSITORY"
  local args=()

  [[ -n "$token" ]] || fail "Could not resolve the runner registration token"

  args=(
    --url "$repo_url"
    --token "$token"
    --name "$RUNNER_NAME"
    --labels "$RUNNER_LABEL"
    --work "$RUNNER_WORK_DIR"
    --unattended
    --replace
  )

  if [[ -n "$RUNNER_GROUP" ]]; then
    args+=(--runnergroup "$RUNNER_GROUP")
  fi

  log "Registering self-hosted runner"
  (
    cd "$RUNNER_DIR"
    ./config.sh "${args[@]}"
  )
}

unlock_login_keychain() {
  prompt_secret_if_empty LOGIN_KEYCHAIN_PASSWORD "macOS login keychain password"
  security unlock-keychain -p "$LOGIN_KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
}

list_codesign_identities() {
  security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Developer ID Application:.*\)"/\1/p' || true
}

first_codesign_identity() {
  list_codesign_identities | head -n 1
}

has_codesign_identity() {
  local identity="$1"
  [[ -n "$identity" ]] || return 1
  list_codesign_identities | grep -Fqx "$identity"
}

import_p12_file() {
  log "Importing Developer ID certificate into login keychain"
  security import "$P12_FILE" \
    -k "$KEYCHAIN_PATH" \
    -P "$P12_PASSWORD" \
    -T /usr/bin/codesign \
    -T /usr/bin/security >/dev/null

  log "Granting codesign access to the imported private key"
  security set-key-partition-list \
    -S apple-tool:,apple:,codesign: \
    -s \
    -k "$LOGIN_KEYCHAIN_PASSWORD" \
    "$KEYCHAIN_PATH" >/dev/null
}

ensure_codesign_identity() {
  local imported_identity=""

  if has_codesign_identity "$APPLE_CODESIGN_IDENTITY"; then
    log "Using configured codesign identity: $APPLE_CODESIGN_IDENTITY"
    return 0
  fi

  if [[ -n "$APPLE_CODESIGN_IDENTITY" ]]; then
    log "Configured APPLE_CODESIGN_IDENTITY was not found in login keychain: $APPLE_CODESIGN_IDENTITY"
  fi

  if [[ -z "$APPLE_CODESIGN_IDENTITY" ]]; then
    APPLE_CODESIGN_IDENTITY="$(first_codesign_identity)"
    if [[ -n "$APPLE_CODESIGN_IDENTITY" ]]; then
      export APPLE_CODESIGN_IDENTITY
      log "Using existing Developer ID identity from login keychain: $APPLE_CODESIGN_IDENTITY"
      return 0
    fi
  fi

  log "No usable Developer ID Application certificate was found in the local login keychain"
  prompt_yes_no "Import a .p12 certificate now?" yes || fail "A Developer ID Application certificate is required for signed DMG builds"

  prompt_value_if_empty P12_FILE "Path to the Developer ID Application .p12 file"
  [[ -f "$P12_FILE" ]] || fail "P12_FILE does not exist: $P12_FILE"
  prompt_secret_if_empty P12_PASSWORD "P12 certificate password"
  unlock_login_keychain
  import_p12_file

  if [[ -z "$APPLE_CODESIGN_IDENTITY" ]] || ! has_codesign_identity "$APPLE_CODESIGN_IDENTITY"; then
    imported_identity="$(first_codesign_identity)"
    [[ -n "$imported_identity" ]] || fail "No Developer ID Application certificate found after importing the .p12"
    APPLE_CODESIGN_IDENTITY="$imported_identity"
    export APPLE_CODESIGN_IDENTITY
  fi

  has_codesign_identity "$APPLE_CODESIGN_IDENTITY" \
    || fail "Configured APPLE_CODESIGN_IDENTITY was not found in the login keychain: $APPLE_CODESIGN_IDENTITY"

  log "Using codesign identity: $APPLE_CODESIGN_IDENTITY"
}

write_runner_env() {
  local env_file="$RUNNER_DIR/.env"

  log "Writing runner-local Apple signing environment"
  : > "$env_file"
  printf '%s\n' "APPLE_ID=$APPLE_ID" >> "$env_file"
  printf '%s\n' "APPLE_PASSWORD=$APPLE_PASSWORD" >> "$env_file"
  printf '%s\n' "APPLE_TEAM_ID=$APPLE_TEAM_ID" >> "$env_file"
  printf '%s\n' "APPLE_CODESIGN_IDENTITY=$APPLE_CODESIGN_IDENTITY" >> "$env_file"
  printf '%s\n' "PATH=$RUNNER_ENV_PATH" >> "$env_file"
  chmod 600 "$env_file"
}

verify_notarytool_credentials() {
  if ! is_true "$VERIFY_NOTARYTOOL"; then
    log "Skipping notarytool credential verification"
    return 0
  fi

  log "Validating Apple notarization credentials"
  xcrun notarytool history \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" >/dev/null
}

install_and_start_service() {
  if ! is_true "$INSTALL_AND_START_SERVICE"; then
    log "Skipping runner service installation/startup"
    return 0
  fi

  log "Installing runner service"
  (
    cd "$RUNNER_DIR"
    ./svc.sh install
  )

  log "Starting runner service"
  (
    cd "$RUNNER_DIR"
    ./svc.sh start
  )
}

check_runner_online() {
  if ! is_true "$CHECK_RUNNER_ONLINE"; then
    return 0
  fi

  if ! can_use_gh_api; then
    log "Skipping online status check because GitHub CLI is unavailable or not authenticated"
    return 0
  fi

  RUNNER_STATUS="$(gh api "repos/$GITHUB_REPOSITORY/actions/runners" --jq ".runners[] | select(.name == \"$RUNNER_NAME\") | .status" | head -n 1 || true)"
  if [[ -n "$RUNNER_STATUS" ]]; then
    log "GitHub runner status: $RUNNER_STATUS"
  else
    log "Runner was registered, but GitHub did not report status yet"
  fi
}

default_release_ref() {
  local branch=""

  if [[ -n "$RELEASE_REF" ]]; then
    printf '%s\n' "$RELEASE_REF"
    return 0
  fi

  if command_exists git && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    if [[ -n "$branch" && "$branch" != "HEAD" ]]; then
      printf '%s\n' "$branch"
      return 0
    fi
  fi

  printf 'canary\n'
}

open_release_workflow_page() {
  log "Opening the Release workflow page in your browser"
  open_url "$(release_workflow_url)"
}

trigger_release_workflow() {
  gh workflow run release.yml \
    --repo "$GITHUB_REPOSITORY" \
    --ref "$RELEASE_REF" \
    -f web=false \
    -f desktop_macos=true \
    -f desktop_windows=false \
    -f desktop_linux=false \
    -f desktop_macos_runner="$RUNNER_LABEL" \
    -f desktop_macos_signing_mode=local-runner-env \
    -f mobile=false
}

maybe_trigger_release_workflow() {
  local default_ref=""

  if ! is_true "$PROMPT_RELEASE_TRIGGER"; then
    return 0
  fi

  if ! prompt_yes_no "Trigger the macOS signed DMG release workflow now?" no; then
    return 0
  fi

  install_gh_with_brew || true

  if ! can_use_gh_api; then
    if command_exists_gh; then
      log "GitHub CLI is installed but not authenticated"
      if prompt_yes_no "Run 'gh auth login' now so the script can trigger the workflow automatically?" yes; then
        gh auth login || true
      fi
    fi
  fi

  if ! can_use_gh_api; then
    log "GitHub CLI still cannot trigger the workflow automatically"
    open_release_workflow_page
    return 0
  fi

  if [[ -n "$RUNNER_STATUS" && "$RUNNER_STATUS" != "online" ]]; then
    log "Runner status is '$RUNNER_STATUS'"
    prompt_yes_no "Trigger the release anyway?" no || return 0
  fi

  default_ref="$(default_release_ref)"
  prompt_value_if_empty RELEASE_REF "Git ref/branch to run release.yml from" "$default_ref"

  log "Triggering release.yml for macOS signed DMG"
  if trigger_release_workflow; then
    RELEASE_TRIGGERED="true"
    log "Release workflow triggered successfully"
  else
    log "Automatic workflow trigger failed"
    if prompt_yes_no "Open the Release workflow page in your browser instead?" yes; then
      open_release_workflow_page
    fi
  fi
}

print_summary() {
  cat <<EOF

Done.

Runner directory:
  $RUNNER_DIR

Runner label to use in GitHub Actions:
  $RUNNER_LABEL

Local-only Apple signing data now lives in:
  $RUNNER_DIR/.env
  $KEYCHAIN_PATH

Quick verification commands:
  security find-identity -v -p codesigning | grep "Developer ID Application"
  grep -E '^(APPLE_ID|APPLE_TEAM_ID|APPLE_CODESIGN_IDENTITY|PATH)=' "$RUNNER_DIR/.env"
  cd "$RUNNER_DIR" && ./svc.sh status

Workflow inputs to use:
  desktop_macos_runner=$RUNNER_LABEL
  desktop_macos_signing_mode=local-runner-env

Example release trigger:
  gh workflow run release.yml --repo $GITHUB_REPOSITORY --ref ${RELEASE_REF:-canary} -f web=false -f desktop_macos=true -f desktop_windows=false -f desktop_linux=false -f desktop_macos_runner=$RUNNER_LABEL -f desktop_macos_signing_mode=local-runner-env -f mobile=false
EOF

  if [[ "$RELEASE_TRIGGERED" == "true" ]]; then
    cat <<EOF

Release workflow was triggered from ref:
  $RELEASE_REF

Useful follow-up commands:
  gh run list --repo $GITHUB_REPOSITORY --workflow release.yml --limit 5
  gh run watch --repo $GITHUB_REPOSITORY --exit-status
EOF
  fi

  cat <<EOF

If the Mac reboots, make sure the runner user logs back in so the login keychain is available to codesign.
EOF
}

main() {
  local runner_arch=""
  local runner_download_url=""
  local runner_token=""

  ensure_macos
  ensure_xcode_cli

  require_cmd curl
  require_cmd tar
  require_cmd security
  require_cmd xcrun
  require_cmd codesign

  log "Starting local self-hosted macOS runner setup for signed DMG builds"
  log "Defaults: repository=$GITHUB_REPOSITORY, runner_label=$RUNNER_LABEL, runner_dir=$RUNNER_DIR"

  collect_notarization_inputs
  ensure_gh_auth_or_manual_fallback

  runner_arch="$(detect_runner_arch)"
  runner_download_url="$(fetch_runner_download_url "$runner_arch")"
  runner_token="$(fetch_runner_registration_token)"

  prepare_runner_dir
  download_runner_if_needed "$runner_download_url"
  configure_runner "$runner_token"
  ensure_codesign_identity
  write_runner_env
  verify_notarytool_credentials
  install_and_start_service
  check_runner_online
  maybe_trigger_release_workflow
  print_summary
}

main "$@"
