#!/bin/bash

packages=(
  "y-indexeddb"
)

for package in "${packages[@]}"; do
  cd "packages/$package"
  yarn build

  if [ "$NIGHTLY" = "true" ]; then
    yarn npm publish --no-git-checks --tag nightly
  else
    yarn npm publish
  fi

  cd ../../
done
