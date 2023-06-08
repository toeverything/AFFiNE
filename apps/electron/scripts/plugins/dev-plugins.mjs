#!/usr/bin/env node
import { context } from 'esbuild';

import { definePluginServerConfig } from './utils.mjs';

const plugin = await context({
  ...definePluginServerConfig('bookmark-block'),
  external: ['cheerio', 'electron', 'puppeteer'],
});

await plugin.watch();
