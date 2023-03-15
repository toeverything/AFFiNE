import * as esbuild from 'esbuild';

import { mainConfig, preloadConfig } from './common.mjs';

esbuild.buildSync({
  ...preloadConfig,
});

esbuild.buildSync({
  ...mainConfig,
  define: {
    'process.env.NODE_ENV': `"production"`,
    'process.env.VITE_DEV_SERVER_URL': `"...?"`,
  },
});

// copy web dist files to electron dist
// FIXME(xp)
