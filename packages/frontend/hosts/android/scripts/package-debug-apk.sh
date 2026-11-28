#!/usr/bin/env bash
set -euo pipefail

# Build and sign `AffineAndroidHost-debug.apk` directly with Android SDK CLI tools
# (`aapt2`, `kotlinc`, `d8`, `zipalign`, `apksigner`) and NDK Clang — zero Gradle daemon.
#
# Usage:
#   ./packages/frontend/hosts/android/scripts/package-debug-apk.sh [out_dir]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_HOST_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$ANDROID_HOST_DIR/../../../.." && pwd)"
MANIFEST="$REPO_ROOT/packages/frontend/Cargo.toml"
OUT_DIR="${1:-$REPO_ROOT/packages/frontend/target/android-apk}"

ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"
if [ ! -d "$ANDROID_SDK" ]; then
  echo "ERROR: Android SDK not found at $ANDROID_SDK" >&2
  exit 1
fi

BUILD_TOOLS_DIR="$(ls -1d "$ANDROID_SDK"/build-tools/* | sort -V | tail -n 1)"
PLATFORM_DIR="$(ls -1d "$ANDROID_SDK"/platforms/android-* | sort -V | tail -n 1)"
ANDROID_JAR="$PLATFORM_DIR/android.jar"
NDK_DIR="${ANDROID_NDK_LATEST_HOME:-$(ls -1d "$ANDROID_SDK"/ndk/* | sort -V | tail -n 1)}"
NDK_BIN="$(ls -1d "$NDK_DIR"/toolchains/llvm/prebuilt/*/bin | head -n 1)"

echo "==> Using SDK=$ANDROID_SDK build-tools=$(basename "$BUILD_TOOLS_DIR") platform=$(basename "$PLATFORM_DIR") ndk=$(basename "$NDK_DIR")"

export CARGO_ENCODED_RUSTFLAGS=""
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$NDK_BIN/aarch64-linux-android24-clang"
export CC_aarch64_linux_android="$NDK_BIN/aarch64-linux-android24-clang"
export AR_aarch64_linux_android="$NDK_BIN/llvm-ar"

echo "==> Building Android NDK libaffine_android_host.so (arm64-v8a)"
rustup run 1.98.1 cargo build --locked --manifest-path "$MANIFEST" -p affine-android-host --target aarch64-linux-android

ARM64_SO="$REPO_ROOT/packages/frontend/target/aarch64-linux-android/debug/libaffine_android_host.so"
test -s "$ARM64_SO"

WORK_DIR="$OUT_DIR/work"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/classes" "$WORK_DIR/dex" "$WORK_DIR/apk_root/lib/arm64-v8a"

echo "==> Compiling Kotlin host sources with kotlinc"
kotlinc -classpath "$ANDROID_JAR" \
  -include-runtime \
  -d "$WORK_DIR/host-classes.jar" \
  "$ANDROID_HOST_DIR/kotlin/app/affine/pro/host/MainActivity.kt" \
  "$ANDROID_HOST_DIR/kotlin/app/affine/pro/host/LegacyLocalStorageProbe.kt" \
  "$ANDROID_HOST_DIR/kotlin/app/affine/pro/host/AndroidBootstrapCoordinator.kt" \
  "$ANDROID_HOST_DIR/kotlin/app/affine/pro/host/AuthDataStore.kt" \
  "$ANDROID_HOST_DIR/kotlin/app/affine/pro/host/ShareIntentBridge.kt"

echo "==> Converting bytecode to DEX with d8"
"$BUILD_TOOLS_DIR/d8" \
  --min-api 24 \
  --lib "$ANDROID_JAR" \
  --output "$WORK_DIR/dex" \
  "$WORK_DIR/host-classes.jar"
test -s "$WORK_DIR/dex/classes.dex"

echo "==> Linking AndroidManifest.xml with aapt2"
"$BUILD_TOOLS_DIR/aapt2" link \
  -I "$ANDROID_JAR" \
  --manifest "$ANDROID_HOST_DIR/AndroidManifest.xml" \
  --min-sdk-version 24 \
  --target-sdk-version 35 \
  -o "$WORK_DIR/unaligned.apk"

cp "$ARM64_SO" "$WORK_DIR/apk_root/lib/arm64-v8a/libaffine_android_host.so"
cp "$WORK_DIR/dex/classes.dex" "$WORK_DIR/apk_root/classes.dex"
for extra_dex in "$WORK_DIR"/dex/classes*.dex; do
  cp "$extra_dex" "$WORK_DIR/apk_root/"
done

(
  cd "$WORK_DIR/apk_root"
  zip -u -r -0 "$WORK_DIR/unaligned.apk" lib
  zip -u -r "$WORK_DIR/unaligned.apk" classes*.dex
)

ALIGNED_APK="$WORK_DIR/aligned.apk"
"$BUILD_TOOLS_DIR/zipalign" -f -p 4 "$WORK_DIR/unaligned.apk" "$ALIGNED_APK"

KEYSTORE="$WORK_DIR/debug.keystore"
keytool -genkeypair -noprompt \
  -keystore "$KEYSTORE" \
  -storepass android \
  -keypass android \
  -alias androiddebugkey \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=Android Debug,O=AFFiNE,C=US"

FINAL_APK="$OUT_DIR/AffineAndroidHost-debug.apk"
"$BUILD_TOOLS_DIR/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-pass pass:android \
  --key-pass pass:android \
  --ks-key-alias androiddebugkey \
  --out "$FINAL_APK" \
  "$ALIGNED_APK"

"$BUILD_TOOLS_DIR/apksigner" verify --verbose "$FINAL_APK"
test -s "$FINAL_APK"
echo "==> Packaged and signed Android debug APK: $FINAL_APK"
