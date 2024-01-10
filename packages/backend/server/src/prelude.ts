import { homedir } from 'node:os';
import { join } from 'node:path';

import { config } from 'dotenv';

import { SERVER_FLAVOR } from './config/default';

if (SERVER_FLAVOR === 'selfhosted') {
  config({ path: join(homedir(), '.affine', '.env') });
} else {
  config();
}

import 'reflect-metadata';
import './affine';
import './affine.config';

if (process.env.NODE_ENV === 'development') {
  console.log('AFFiNE Config:', globalThis.AFFiNE);
}
