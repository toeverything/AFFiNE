#!/bin/bash

LATEST_NIGHTLY=$(npm view @blocksuite/presets@nightly version | cut -d ':' -f 2 | tr -d '[:space:]')
echo "Bump to latest BlockSuite nightly version: $LATEST_NIGHTLY"

yarn up \
  "@blocksuite/store@${LATEST_NIGHTLY}" \
  "@blocksuite/blocks@${LATEST_NIGHTLY}" \
  "@blocksuite/presets@${LATEST_NIGHTLY}" \
  "@blocksuite/global@${LATEST_NIGHTLY}" \
  "@blocksuite/block-std@${LATEST_NIGHTLY}" \
  "@blocksuite/lit@${LATEST_NIGHTLY}" \
  "@blocksuite/inline@${LATEST_NIGHTLY}"
