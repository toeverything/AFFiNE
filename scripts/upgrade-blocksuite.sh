#!/usr/bin/env bash
# Usage:
#   ./scripts/upgrade-blocksuite.sh --latest
#   ./scripts/upgrade-blocksuite.sh 0.4.0-20230209191848-0a912e3

if [ "$1" == "--latest" ]; then
  pnpm up "@blocksuite/*" "!@blocksuite/icons" -r -i --latest
else
  pnpm up "@blocksuite/*@${1}" "!@blocksuite/icons" -r
fi

