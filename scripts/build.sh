corepack enable
corepack prepare yarn@stable --activate

find . -name 'node_modules' -type d -prune -exec rm -rf '{}' +
yarn install

yarn affine @affine/native build
yarn affine @affine/server-native build


BUILD_TYPE=canary yarn affine @affine/electron build
BUILD_TYPE=canary yarn affine @affine/electron generate-assets

yarn config set nmMode classic
yarn config set nmHoistingLimits workspaces

find . -name 'node_modules' -type d -prune -exec rm -rf '{}' +
yarn install

BUILD_TYPE=canary SKIP_WEB_BUILD=1 SKIP_BUNDLE=1 HOIST_NODE_MODULES=1 yarn affine @affine/electron make