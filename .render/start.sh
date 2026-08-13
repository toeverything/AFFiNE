#!/bin/sh
set -e

# Set the public hostname from the one Render assigns, unless it is already set
# (a custom domain, for example).
export AFFINE_SERVER_HOST="${AFFINE_SERVER_HOST:-$RENDER_EXTERNAL_HOSTNAME}"

# Generates the server private key on first boot, then runs the Prisma and data
# migrations. Safe to run on every boot.
node ./scripts/self-host-predeploy.js

exec node ./dist/main.js
