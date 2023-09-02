import 'reflect-metadata';
import 'dotenv/config';

import { getDefaultAFFiNEConfig } from './config/default';

globalThis.AFFiNE = getDefaultAFFiNEConfig();

if (process.env.NODE_ENV === 'development') {
  console.log('AFFiNE Config:', globalThis.AFFiNE);
}
