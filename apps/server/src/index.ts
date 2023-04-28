import './prelude';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app';

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  cors: {
    origin:
      process.env.AFFINE_ENV === 'preview'
        ? ['https://affine-preview.vercel.app']
        : ['http://localhost:8080'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: '*',
  },
  bodyParser: true,
});

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ?? 3010;

await app.listen(port, host);

console.log(`Listening on http://${host}:${port}`);
