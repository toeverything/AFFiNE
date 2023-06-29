import 'reflect-metadata';
import 'dotenv/config';

import { getDefaultAFFiNEConfig, registerEnvs } from './config/default';

globalThis.AFFiNE = getDefaultAFFiNEConfig();

globalThis.AFFiNE.ENV_MAP = {
  DATABASE_URL: 'db.url',
};

registerEnvs();
