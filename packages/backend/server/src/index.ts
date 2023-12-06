/// <reference types="./global.d.ts" />
import { start as startAutoMetrics } from './metrics';
startAutoMetrics();

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { static as staticMiddleware } from 'express';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { AppModule } from './app';
import { Config } from './config';
import { ExceptionLogger } from './middleware/exception-logger';
import { serverTimingAndCache } from './middleware/timing';
import { RedisIoAdapter } from './modules/sync/redis-adapter';

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

if (!config.objectStorage.r2.enabled) {
  app.use('/assets', staticMiddleware(config.objectStorage.fs.path));
}

if (config.redis.enabled) {
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(
    config.redis.host,
    config.redis.port,
    config.redis.username,
    config.redis.password,
    config.redis.database
  );
  app.useWebSocketAdapter(redisIoAdapter);
}

await app.listen(port, host);

console.log(`Listening on http://${host}:${port}`);
