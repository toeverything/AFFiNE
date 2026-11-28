#!/usr/bin/env bash
set -euo pipefail

# Build and assemble an installable iOS Simulator `.app` bundle (`AffineIosHost.app`)
# with zero CocoaPods and zero Xcode project files.
#
# Usage:
#   ./packages/frontend/hosts/ios/scripts/package-sim-app.sh [debug|release] [out_dir]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_HOST_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$IOS_HOST_DIR/../../../.." && pwd)"
MANIFEST="$REPO_ROOT/packages/frontend/Cargo.toml"

PROFILE="${1:-debug}"
OUT_DIR="${2:-$REPO_ROOT/packages/frontend/target/ios-sim-app}"
TARGET="aarch64-apple-ios-sim"

PROFILE_ARGS=()
PROFILE_SUBDIR="debug"
if [ "$PROFILE" = "release" ]; then
  PROFILE_ARGS+=(--release)
  PROFILE_SUBDIR="release"
fi

echo "==> Building libaffine_ios_host.a ($TARGET, $PROFILE)"
CARGO_ENCODED_RUSTFLAGS="" rustup run 1.98.1 cargo build \
  --locked \
  --manifest-path "$MANIFEST" \
  -p affine-ios-host \
  --target "$TARGET" \
  "${PROFILE_ARGS[@]}"

LIB_DIR="$REPO_ROOT/packages/frontend/target/$TARGET/$PROFILE_SUBDIR"
test -s "$LIB_DIR/libaffine_ios_host.a"

APP_DIR="$OUT_DIR/AffineIosHost.app"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"

SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
echo "==> Linking AffineIosHost against iOS Simulator SDK: $SDK"
swiftc -emit-executable \
  -sdk "$SDK" \
  -target arm64-apple-ios16.0-simulator \
  -import-objc-header "$IOS_HOST_DIR/include/affine_mobile_host.h" \
  -L "$LIB_DIR" \
  -laffine_ios_host \
  -framework UIKit \
  -framework QuartzCore \
  -framework Metal \
  -framework WebKit \
  -framework PDFKit \
  -framework CoreText \
  -framework CoreGraphics \
  -framework CoreVideo \
  -framework CoreFoundation \
  -framework Foundation \
  -framework UniformTypeIdentifiers \
  -framework StoreKit \
  -framework AuthenticationServices \
  -o "$APP_DIR/AffineIosHost" \
  "$IOS_HOST_DIR"/Sources/*.swift

cp "$IOS_HOST_DIR/Info.plist" "$APP_DIR/Info.plist"
printf 'APPL????' > "$APP_DIR/PkgInfo"
codesign --force --sign - "$APP_DIR"

test -s "$APP_DIR/AffineIosHost"
test -s "$APP_DIR/Info.plist"
echo "==> Assembled iOS Simulator bundle: $APP_DIR"
