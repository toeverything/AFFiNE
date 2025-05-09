#!/bin/zsh

# This script provides a quick setup process for iOS developers working on this project.

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
yarn affine @affine/ios sync

echo "[*] interacting with rust..."
rustup target add aarch64-apple-ios
rustup target add aarch64-apple-ios-sim
rustup target add aarch64-apple-darwin

echo "[*] codegen..."
yarn affine @affine/ios codegen

echo "[+] setup complete"

yarn affine @affine/ios xcode
