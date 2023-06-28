#!/bin/bash

packages=(
  "y-indexeddb"
  "infra"
  "plugin-infra"
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
