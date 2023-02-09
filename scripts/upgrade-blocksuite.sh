#!/usr/bin/env bash
# Usage:
#   ./scripts/upgrade-blocksuite.sh
#   ./scripts/upgrade-blocksuite.sh --latest

pnpm up "@blocksuite/*" "!@blocksuite/icons" -r -i "$@"
