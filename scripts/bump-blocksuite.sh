#!/bin/bash

LATEST_NIGHTLY=$(npm view @blocksuite/editor@nightly version | cut -d ':' -f 2 | tr -d '[:space:]')
echo "Bump to latest BlockSuite nightly version: $LATEST_NIGHTLY"

yarn up "@blocksuite/store@${LATEST_NIGHTLY}"
yarn up "@blocksuite/blocks@${LATEST_NIGHTLY}"
yarn up "@blocksuite/editor@${LATEST_NIGHTLY}"
yarn up "@blocksuite/global@${LATEST_NIGHTLY}"
