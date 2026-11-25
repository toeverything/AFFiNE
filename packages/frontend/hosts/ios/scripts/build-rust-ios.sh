#!/usr/bin/env bash
set -euo pipefail

# Zero-CocoaPods iOS Rust build helper.
# Explicitly pins Rust 1.98.1 and packages/frontend/Cargo.toml so legacy
# packages/frontend/apps/ios (1.97.1) stays completely isolated.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
MANIFEST="$REPO_ROOT/packages/frontend/Cargo.toml"

TARGET="${1:-aarch64-apple-ios-sim}"
PROFILE="${2:-release}"

case "$TARGET" in
  aarch64-apple-ios | aarch64-apple-ios-sim) ;;
  *)
    echo "ERROR: unsupported iOS target '$TARGET' (expected aarch64-apple-ios or aarch64-apple-ios-sim)" >&2
    exit 1
    ;;
esac

PROFILE_ARGS=()
if [ "$PROFILE" = "release" ]; then
  PROFILE_ARGS+=(--release)
fi

CARGO_ENCODED_RUSTFLAGS="" rustup run 1.98.1 cargo build \
  --locked \
  --manifest-path "$MANIFEST" \
  -p affine-ios-host \
  --target "$TARGET" \
  "${PROFILE_ARGS[@]}"
