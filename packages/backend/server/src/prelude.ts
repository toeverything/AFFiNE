import 'reflect-metadata';

import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { config } from 'dotenv';

import {
  applyEnvToConfig,
  getAFFiNEConfigModifier,
} from './fundamentals/config';
import { enablePlugin } from './plugins';

const configDir = join(fileURLToPath(import.meta.url), '../config');
async function loadRemote(remoteDir: string, file: string) {
  const filePath = join(configDir, file);
  if (configDir !== remoteDir) {
    cpSync(join(remoteDir, file), filePath, {
      force: true,
    });
  }

  await import(pathToFileURL(filePath).href);
}

async function load() {
  const AFFiNE_CONFIG_PATH = process.env.AFFINE_CONFIG_PATH ?? configDir;
  // Initializing AFFiNE config
  //
  // 1. load dotenv file to `process.env`
  // load `.env` under pwd
  config();
  // load `.env` under user config folder
  config({
    path: join(AFFiNE_CONFIG_PATH, '.env'),
  });

  // 2. generate AFFiNE default config and assign to `globalThis.AFFiNE`
  globalThis.AFFiNE = getAFFiNEConfigModifier();
  globalThis.AFFiNE.use = enablePlugin;

  // TODO(@forehalo):
  //   Modules may contribute to ENV_MAP, figure out a good way to involve them instead of hardcoding in `./config/affine.env`
  // 3. load env => config map to `globalThis.AFFiNE.ENV_MAP
  await loadRemote(AFFiNE_CONFIG_PATH, 'affine.env.js');

  // 4. load `config/affine` to patch custom configs
  await loadRemote(AFFiNE_CONFIG_PATH, 'affine.js');

  // 5. load `config/affine.self` to patch custom configs
  // This is the file only take effect in [AFFiNE Cloud]
  if (!AFFiNE.isSelfhosted) {
    await loadRemote(AFFiNE_CONFIG_PATH, 'affine.self.js');
  }

  // 6. apply `process.env` map overriding to `globalThis.AFFiNE`
  applyEnvToConfig(globalThis.AFFiNE);
}

await load();
