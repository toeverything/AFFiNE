import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { CacheRedis } from './fundamentals/cache/redis';
import { RedisIoAdapter } from './fundamentals/websocket';
import { ExceptionLogger } from './middleware/exception-logger';
import { serverTimingAndCache } from './middleware/timing';

export async function createApp() {
  const { AppModule } = await import('./app.module');

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

  return app;
}
