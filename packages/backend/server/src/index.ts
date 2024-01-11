/// <reference types="./global.d.ts" />
// keep the config import at the top
// eslint-disable-next-line simple-import-sort/imports
import './prelude';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { AppModule } from './app';
import { Config } from './config';
import { ExceptionLogger } from './middleware/exception-logger';
import { serverTimingAndCache } from './middleware/timing';
import { RedisIoAdapter } from './modules/sync/redis-adapter';
import { CacheRedis } from './cache/redis';

const { NODE_ENV, AFFINE_ENV } = process.env;
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  cors: true,
  rawBody: true,
  bodyParser: true,
  logger:
    NODE_ENV !== 'production' || AFFINE_ENV !== 'production'
      ? ['verbose']
      : ['log'],
});

app.use(serverTimingAndCache);

app.use(
  graphqlUploadExpress({
    // TODO: dynamic limit by quota
    maxFileSize: 100 * 1024 * 1024,
    maxFiles: 5,
  })
);

app.useGlobalFilters(new ExceptionLogger());
app.use(cookieParser());

const config = app.get(Config);

const host = config.node.prod ? '0.0.0.0' : 'localhost';
const port = config.port ?? 3010;

if (!config.node.test && config.redis.enabled) {
  const redis = app.get(CacheRedis, { strict: false });
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(redis);
  app.useWebSocketAdapter(redisIoAdapter);
}

await app.listen(port, host);

console.log(`Listening on http://${host}:${port}`);
