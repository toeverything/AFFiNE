#!/bin/bash

packages=(
  "y-indexeddb"
  "infra"
  "sdk"
)

for package in "${packages[@]}"; do
  yarn nx build $package
  cd "packages/$package"

  if [ "$NIGHTLY" = "true" ]; then
    yarn npm publish --no-git-checks --tag nightly
  else
    yarn npm publish
  fi

  cd ../../
done

yarn nx build @blocksuite/react
cd "packages/blocksuite/react"
if [ "$NIGHTLY" = "true" ]; then
  yarn npm publish --no-git-checks --tag nightly
else
  yarn npm publish
fi
