/// <reference types="./global.d.ts" />
import { MetricExporter } from '@google-cloud/opentelemetry-cloud-monitoring-exporter';
import { TraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import gql from '@opentelemetry/instrumentation-graphql';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import ioredis from '@opentelemetry/instrumentation-ioredis';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import socketIO from '@opentelemetry/instrumentation-socket.io';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import cookieParser from 'cookie-parser';
import { static as staticMiddleware } from 'express';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { AppModule } from './app';
import { Config } from './config';
import { serverTimingAndCache } from './middleware/timing';
import { RedisIoAdapter } from './modules/sync/redis-adapter';

const { NODE_ENV, AFFINE_ENV } = process.env;

if (NODE_ENV === 'production') {
  const traceExporter = new TraceExporter();
  const tracing = new NodeSDK({
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: new MetricExporter(),
    }),
    spanProcessor: new BatchSpanProcessor(traceExporter),
    textMapPropagator: new CompositePropagator({
      propagators: [
        new W3CBaggagePropagator(),
        new W3CTraceContextPropagator(),
      ],
    }),
    instrumentations: [
      new NestInstrumentation(),
      new ioredis.IORedisInstrumentation(),
      new socketIO.SocketIoInstrumentation({ traceReserved: true }),
      new gql.GraphQLInstrumentation({ mergeItems: true }),
      new HttpInstrumentation(),
      new PrismaInstrumentation(),
    ],
    serviceName: 'affine-cloud',
  });

  tracing.start();
}

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  cors: true,
  bodyParser: true,
  logger:
    NODE_ENV !== 'production' || AFFINE_ENV !== 'production'
      ? ['verbose']
      : ['log'],
});

app.use(serverTimingAndCache);

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
