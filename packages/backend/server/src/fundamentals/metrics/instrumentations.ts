import { Instrumentation } from '@opentelemetry/instrumentation';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { SocketIoInstrumentation } from '@opentelemetry/instrumentation-socket.io';
import prismaInstrument from '@prisma/instrumentation';

const { PrismaInstrumentation } = prismaInstrument;

let instrumentations: Instrumentation[] = [];

export function registerInstrumentations(): void {
  if (AFFiNE.metrics.enabled) {
    instrumentations = [
      new NestInstrumentation(),
      new IORedisInstrumentation(),
      new SocketIoInstrumentation({ traceReserved: true }),
      new GraphQLInstrumentation({
        mergeItems: true,
        ignoreTrivialResolveSpans: true,
        depth: 10,
      }),
      new HttpInstrumentation(),
      new PrismaInstrumentation({ middleware: false }),
    ];
  }
}

export function getRegisteredInstrumentations(): Instrumentation[] {
  return instrumentations;
}
