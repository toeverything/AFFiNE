#!/bin/sh
set -eu

# Use the hostname Render assigns, unless AFFINE_SERVER_HOST is already set to a
# custom domain.
export AFFINE_SERVER_HOST="${AFFINE_SERVER_HOST:-${RENDER_EXTERNAL_HOSTNAME:-localhost}}"

# Generates the server private key on first boot, then runs the Prisma and data
# migrations. Safe to run on every boot.
node ./scripts/self-host-predeploy.js

exec node ./dist/main.js
