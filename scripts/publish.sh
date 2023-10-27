#!/bin/bash

packages=(
  "y-indexeddb"
  "y-provider"
  "infra"
  "sdk"
)

for package in "${packages[@]}"; do
  yarn nx build $package
  cd "packages/common/$package"

  if [ "$NIGHTLY" = "true" ]; then
    yarn npm publish --no-git-checks --tag nightly
  else
    yarn npm publish
  fi

  cd ../../../
done
