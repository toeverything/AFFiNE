/// <reference types="./global.d.ts" />
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { static as staticMiddleware } from 'express';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { AppModule } from './app';
import { Config } from './config';

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  cors: {
    origin:
      process.env.AFFINE_ENV === 'preview'
        ? ['https://affine-preview.vercel.app']
        : ['http://localhost:8080'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['x-operation-name', 'x-definition-name'],
  },
  bodyParser: true,
});

app.use(
  graphqlUploadExpress({
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 5,
  })
);

app.use(cookieParser());

const config = app.get(Config);

const host = config.host ?? 'localhost';
const port = config.port ?? 3010;

if (!config.objectStorage.r2.enabled) {
  app.use('/assets', staticMiddleware(config.objectStorage.fs.path));
}

await app.listen(port, host);

console.log(`Listening on http://${host}:${port}`);
