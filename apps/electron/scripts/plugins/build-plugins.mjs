#!/usr/bin/env node
import { build } from 'esbuild';

import { definePluginServerConfig } from './utils.mjs';

await build({
  ...definePluginServerConfig('bookmark-block'),
  external: [
    // server.ts
    'link-preview-js',
    // ui.ts
    '@toeverything/plugin-infra',
    '@affine/component',
    '@blocksuite/store',
    '@blocksuite/blocks',
    'react',
    'react-dom',
    'foxact',
  ],
});
