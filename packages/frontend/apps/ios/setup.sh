#!/bin/zsh


set -e
set -o pipefail

# packages/frontend/apps/ios/


cd "$(dirname "$0")"

export SCRIPT_DIR_PATH=$(pwd)
export BUILD_TYPE=canary
export PUBLIC_PATH="/"

cd ../../../../

if [ ! -d .git ]; then
  echo "[-] .git directory not found at project root"
  exit 1
fi

echo "[+] setting up the project"

echo "[*] interacting with yarn..."
yarn install

echo "[*] temporary set pbxproj to use object version 56"
XCPROJ_PATH=$SCRIPT_DIR_PATH/App/App.xcodeproj/project.pbxproj
CURRENT_VERSION=$(grep "objectVersion = " "$XCPROJ_PATH" | awk -F ' = ' '{print $2}' | tr -d ';')
echo "[*] current object version: $CURRENT_VERSION"
sed -i '' "s/objectVersion = $CURRENT_VERSION/objectVersion = 56/" "$XCPROJ_PATH"

yarn affine @affine/ios build
yarn affine @affine/ios cap sync

echo "[*] interacting with rust..."
rustup target add aarch64-apple-ios
rustup target add aarch64-apple-ios-sim
rustup target add aarch64-apple-darwin

cargo build -p affine_mobile_native --lib --release --target aarch64-apple-ios
cargo run -p affine_mobile_native --bin uniffi-bindgen \
    generate \
    --library target/aarch64-apple-ios/release/libaffine_mobile_native.a \
    --language swift \
    --out-dir packages/frontend/apps/ios/App/App/uniffi

echo "[*] interacting with graphql..."
apollo-ios-cli generate --path $SCRIPT_DIR_PATH/apollo-codegen-config.json

echo "[*] setting object version back to $CURRENT_VERSION"
sed -i '' "s/objectVersion = 56/objectVersion = $CURRENT_VERSION/" "$XCPROJ_PATH"

echo "[+] setup complete"

yarn affine @affine/ios cap open ios
