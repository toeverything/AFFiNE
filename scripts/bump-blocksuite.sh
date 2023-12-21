#!/bin/bash

LATEST_NIGHTLY=$(npm view @blocksuite/presets@nightly version | cut -d ':' -f 2 | tr -d '[:space:]')
echo "Bump to latest BlockSuite nightly version: $LATEST_NIGHTLY"

yarn up "@blocksuite/store@${LATEST_NIGHTLY}"
yarn up "@blocksuite/blocks@${LATEST_NIGHTLY}"
yarn up "@blocksuite/presets@${LATEST_NIGHTLY}"
yarn up "@blocksuite/global@${LATEST_NIGHTLY}"
yarn up "@blocksuite/block-std@${LATEST_NIGHTLY}"
yarn up "@blocksuite/lit@${LATEST_NIGHTLY}"
yarn up "@blocksuite/inline@${LATEST_NIGHTLY}"
