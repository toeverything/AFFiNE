/// <reference types="./global.d.ts" />
// keep the config import at the top
// eslint-disable-next-line simple-import-sort/imports
import './prelude';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { AppModule } from './app';
import { RedisIoAdapter } from './fundamentals';
import { CacheRedis } from './fundamentals/cache/redis';
import { ExceptionLogger } from './middleware/exception-logger';
import { serverTimingAndCache } from './middleware/timing';

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  cors: true,
  rawBody: true,
  bodyParser: true,
  logger: AFFiNE.affine.stable ? ['log'] : ['verbose'],
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

if (AFFiNE.redis.enabled) {
  const redis = app.get(CacheRedis, { strict: false });
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(redis);
  app.useWebSocketAdapter(redisIoAdapter);
}

await app.listen(AFFiNE.port, AFFiNE.host);

console.log(
  `AFFiNE Server has been started on http://${AFFiNE.host}:${AFFiNE.port}.`
);
console.log(`And the public server should be recognized as ${AFFiNE.baseUrl}`);
