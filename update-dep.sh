#!/bin/bash
cd packages/app
pnpm i @blocksuite/store@nightly @blocksuite/blocks@nightly @blocksuite/editor@nightly
cd ../data-center
pnpm i @blocksuite/store@nightly @blocksuite/blocks@nightly @blocksuite/editor@nightly
