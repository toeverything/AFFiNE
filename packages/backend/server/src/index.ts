/// <reference types="./global.d.ts" />
import './prelude';

import { Logger } from '@nestjs/common';

import { createApp } from './app';

const app = await createApp();
const listeningHost = AFFiNE.deploy ? '0.0.0.0' : 'localhost';
await app.listen(AFFiNE.port, listeningHost);

const logger = new Logger('App');

logger.log(`AFFiNE Server is running in [${AFFiNE.type}] mode`);
logger.log(`Listening on http://${listeningHost}:${AFFiNE.port}`);
logger.log(`And the public server should be recognized as ${AFFiNE.baseUrl}`);
