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
# buildvariant from our xcconfigs
BUILDVARIANT=$(echo "${3}" | tr '[:upper:]' '[:lower:]')

RELFLAG=
if [[ "${BUILDVARIANT}" != "debug" ]]; then
    RELFLAG=release
else
    RELFLAG=debug
fi

IS_SIMULATOR=0
if [ "${LLVM_TARGET_TRIPLE_SUFFIX-}" = "-simulator" ]; then
  IS_SIMULATOR=1
fi

for arch in $ARCHS; do
  case "$arch" in
    x86_64)
      if [ $IS_SIMULATOR -eq 0 ]; then
        echo "Building for x86_64, but not a simulator build. What's going on?" >&2
        exit 2
      fi

      # Intel iOS simulator
      export CFLAGS_x86_64_apple_ios="-target x86_64-apple-ios"
      $HOME/.cargo/bin/cargo rustc -p "${FFI_TARGET}" --lib --crate-type staticlib --$RELFLAG --target x86_64-apple-ios --features use-as-lib
      ;;

    arm64)
      if [ $IS_SIMULATOR -eq 0 ]; then
        # Hardware iOS targets
        $HOME/.cargo/bin/cargo rustc -p "${FFI_TARGET}" --lib --crate-type staticlib --$RELFLAG --target aarch64-apple-ios --features use-as-lib
        cp $SRC_ROOT/../../../target/aarch64-apple-ios/${RELFLAG}/lib${FFI_TARGET}.a $SRCROOT/lib${FFI_TARGET}.a
      else
        # M1 iOS simulator
        $HOME/.cargo/bin/cargo rustc -p "${FFI_TARGET}" --lib --crate-type staticlib --$RELFLAG --target aarch64-apple-ios-sim --features use-as-lib
        cp $SRC_ROOT/../../../target/aarch64-apple-ios-sim/${RELFLAG}/lib${FFI_TARGET}.a $SRCROOT/lib${FFI_TARGET}.a
      fi
  esac
done

$HOME/.cargo/bin/cargo run -p affine_mobile_native --features use-as-lib --bin uniffi-bindgen generate --library $SRCROOT/lib${FFI_TARGET}.a --language swift --out-dir $SRCROOT/../../ios/App/App/uniffi
