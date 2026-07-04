#!/usr/bin/env bash
set -eEuvx

function error_help()
{
    ERROR_MSG="It looks like something went wrong building the Universal Binary."
    echo "error: ${ERROR_MSG}"
}
trap error_help ERR

# XCode tries to be helpful and overwrites the PATH. Reset that.
PATH="$(bash -l -c 'echo $PATH')"

# Resolve cargo binary: prefer ~/.cargo/bin, then PATH, then rustup
CARGO=""
if [ -x "$HOME/.cargo/bin/cargo" ]; then
  CARGO="$HOME/.cargo/bin/cargo"
elif command -v cargo &>/dev/null; then
  CARGO="$(command -v cargo)"
elif command -v rustup &>/dev/null; then
  CARGO="$(rustup which cargo 2>/dev/null)" || true
fi
if [ -z "$CARGO" ] || [ ! -x "$CARGO" ]; then
  echo "error: cargo not found. Install Rust via https://rustup.rs" >&2
  exit 1
fi
# Ensure rustc and other toolchain binaries are on PATH
export PATH="$(dirname "$CARGO"):$PATH"

# Ensure IPHONEOS_DEPLOYMENT_TARGET is set for Rust/cc crate builds
export IPHONEOS_DEPLOYMENT_TARGET="${IPHONEOS_DEPLOYMENT_TARGET:-16.5}"

# This should be invoked from inside xcode, not manually
if [[ "${#}" -ne 3 ]]
then
    echo "Usage (note: only call inside xcode!):"
    echo "path/to/build-scripts/xc-universal-binary.sh <FFI_TARGET> <SRC_ROOT_PATH> <buildvariant>"
    exit 1
fi
# what to pass to cargo build -p, e.g. logins_ffi
FFI_TARGET=${1}
# path to source code root
SRC_ROOT=${2}
# Keep Cargo artifacts in a stable location that the rest of this script can reference.
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$SRC_ROOT/../../../target}"
# buildvariant from our xcconfigs
BUILDVARIANT=$(echo "${3}" | tr '[:upper:]' '[:lower:]')

RELFLAG=debug
CARGO_PROFILE_FLAG=
if [[ "${BUILDVARIANT}" != "debug" ]]; then
    RELFLAG=release
    CARGO_PROFILE_FLAG=--release
fi

IS_SIMULATOR=0
if [ "${LLVM_TARGET_TRIPLE_SUFFIX-}" = "-simulator" ]; then
  IS_SIMULATOR=1
fi

SIM_ARM64_LIB=
SIM_X86_64_LIB=
DEVICE_ARM64_LIB=
OUTPUT_LIB="$SRCROOT/lib${FFI_TARGET}.a"

for arch in $ARCHS; do
  case "$arch" in
    x86_64)
      if [ $IS_SIMULATOR -eq 0 ]; then
        echo "Building for x86_64, but not a simulator build. What's going on?" >&2
        exit 2
      fi

      # Intel iOS simulator
      export CFLAGS_x86_64_apple_ios="-target x86_64-apple-ios"
      $CARGO rustc -p "${FFI_TARGET}" --lib --crate-type staticlib ${CARGO_PROFILE_FLAG:+$CARGO_PROFILE_FLAG} --target x86_64-apple-ios --features use-as-lib
      SIM_X86_64_LIB="$CARGO_TARGET_DIR/x86_64-apple-ios/${RELFLAG}/lib${FFI_TARGET}.a"
      ;;

    arm64)
      if [ $IS_SIMULATOR -eq 0 ]; then
        # Hardware iOS targets
        $CARGO rustc -p "${FFI_TARGET}" --lib --crate-type staticlib ${CARGO_PROFILE_FLAG:+$CARGO_PROFILE_FLAG} --target aarch64-apple-ios --features use-as-lib
        DEVICE_ARM64_LIB="$CARGO_TARGET_DIR/aarch64-apple-ios/${RELFLAG}/lib${FFI_TARGET}.a"
      else
        # Apple Silicon iOS simulator
        $CARGO rustc -p "${FFI_TARGET}" --lib --crate-type staticlib ${CARGO_PROFILE_FLAG:+$CARGO_PROFILE_FLAG} --target aarch64-apple-ios-sim --features use-as-lib
        SIM_ARM64_LIB="$CARGO_TARGET_DIR/aarch64-apple-ios-sim/${RELFLAG}/lib${FFI_TARGET}.a"
      fi
      ;;
  esac
done

BINDGEN_LIB=
if [ $IS_SIMULATOR -eq 0 ]; then
  BINDGEN_LIB="$DEVICE_ARM64_LIB"
elif [ -n "$SIM_ARM64_LIB" ]; then
  BINDGEN_LIB="$SIM_ARM64_LIB"
elif [ -n "$SIM_X86_64_LIB" ]; then
  BINDGEN_LIB="$SIM_X86_64_LIB"
else
  echo "error: no simulator Rust library was produced" >&2
  exit 1
fi

$CARGO run -p affine_mobile_native --features use-as-lib --bin uniffi-bindgen generate --library "$BINDGEN_LIB" --language swift --out-dir $SRCROOT/../../ios/App/App/uniffi

if [ $IS_SIMULATOR -eq 0 ]; then
  cp "$DEVICE_ARM64_LIB" "$OUTPUT_LIB"
elif [ -n "$SIM_ARM64_LIB" ] && [ -n "$SIM_X86_64_LIB" ]; then
  lipo -create "$SIM_ARM64_LIB" "$SIM_X86_64_LIB" -output "$OUTPUT_LIB"
elif [ -n "$SIM_ARM64_LIB" ]; then
  cp "$SIM_ARM64_LIB" "$OUTPUT_LIB"
else
  cp "$SIM_X86_64_LIB" "$OUTPUT_LIB"
fi
