import 'reflect-metadata';

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

import {
  applyEnvToConfig,
  getDefaultAFFiNEConfig,
} from './fundamentals/config';

async function load() {
  // Initializing AFFiNE config
  //
  // 1. load dotenv file to `process.env`
  // load `.env` under pwd
  config();
  // load `.env` under user config folder
  config({
    path: join(fileURLToPath(import.meta.url), '../config/.env'),
  });

  // 2. generate AFFiNE default config and assign to `globalThis.AFFiNE`
  globalThis.AFFiNE = getDefaultAFFiNEConfig();

  // TODO(@forehalo):
  //   Modules may contribute to ENV_MAP, figure out a good way to involve them instead of hardcoding in `./config/affine.env`
  // 3. load env => config map to `globalThis.AFFiNE.ENV_MAP
  await import('./config/affine.env');

  // 4. apply `process.env` map overriding to `globalThis.AFFiNE`
  applyEnvToConfig(globalThis.AFFiNE);

  // 5. load `./config/affine` to patch custom configs
  await import('./config/affine');

  if (process.env.NODE_ENV === 'development') {
    console.log('AFFiNE Config:', JSON.stringify(globalThis.AFFiNE, null, 2));
  }
}

await load();
