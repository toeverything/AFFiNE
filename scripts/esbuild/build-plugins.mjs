#!/usr/bin/env node
import { build } from 'esbuild';

import { definePluginServerConfig } from './utils.mjs';

await build({
  ...definePluginServerConfig('bookmark-block'),
  external: ['cheerio', 'electron'],
});
