import 'reflect-metadata';
import 'dotenv/config';

import { getDefaultAFFiNEConfig } from './config/default';

globalThis.AFFiNE = getDefaultAFFiNEConfig();
