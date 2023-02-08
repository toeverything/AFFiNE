#!/usr/bin/env bash

workdir="$(dirname $(dirname "$(readlink -f "$0")"))" # AFFiNE root directory
find "$workdir" -name "node_modules" -exec rm -rf '{}' +
