import 'reflect-metadata';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from 'dotenv';

import { createGlobalEnv } from './env';

function loadPrivateKey() {
  const file = join(CUSTOM_CONFIG_PATH, 'private.key');
  if (!process.env.AFFINE_PRIVATE_KEY && existsSync(file)) {
    const privateKey = readFileSync(file, 'utf-8');
    process.env.AFFINE_PRIVATE_KEY = privateKey;
  }
}

function load() {
  let isPrivateKeyFromEnv = !!process.env.AFFINE_PRIVATE_KEY;
  // load `.env` under pwd
  config();
  // load `.env` under user config folder
  config({
    path: join(CUSTOM_CONFIG_PATH, '.env'),
  });

  // The old AFFINE_PRIVATE_KEY in old .env is somehow not working,
  // we should ignore it
  if (!isPrivateKeyFromEnv) {
    delete process.env.AFFINE_PRIVATE_KEY;
  }

  // 2. load `config/private.key` to patch app configs
  loadPrivateKey();
}

load();
createGlobalEnv();
