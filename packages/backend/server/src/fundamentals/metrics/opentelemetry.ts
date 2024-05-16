import { OnModuleDestroy } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { HostMetrics } from '@opentelemetry/host-metrics';
import { Instrumentation } from '@opentelemetry/instrumentation';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { SocketIoInstrumentation } from '@opentelemetry/instrumentation-socket.io';
import { Resource } from '@opentelemetry/resources';
import type { MeterProvider } from '@opentelemetry/sdk-metrics';
import { MetricProducer, MetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  SpanExporter,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node';
import {
  SEMRESATTRS_K8S_NAMESPACE_NAME,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import prismaInstrument from '@prisma/instrumentation';

import { PrismaMetricProducer } from './prisma';

const { PrismaInstrumentation } = prismaInstrument;

export abstract class OpentelemetryFactory {
  abstract getMetricReader(): MetricReader;
  abstract getSpanExporter(): SpanExporter;

  getInstractions(): Instrumentation[] {
    return [
      new NestInstrumentation(),
      new IORedisInstrumentation(),
      new SocketIoInstrumentation({ traceReserved: true }),
      new GraphQLInstrumentation({ mergeItems: true }),
      new HttpInstrumentation(),
      new PrismaInstrumentation(),
    ];
  }

  getMetricsProducers(): MetricProducer[] {
    return [new PrismaMetricProducer()];
  }

  getResource() {
    return new Resource({
      [SEMRESATTRS_K8S_NAMESPACE_NAME]: AFFiNE.AFFINE_ENV,
      [SEMRESATTRS_SERVICE_NAME]: AFFiNE.flavor.type,
      [SEMRESATTRS_SERVICE_VERSION]: AFFiNE.version,
    });
  }

  create() {
    const traceExporter = this.getSpanExporter();
    return new NodeSDK({
      resource: this.getResource(),
      sampler: new TraceIdRatioBasedSampler(0.1),
      traceExporter,
      metricReader: this.getMetricReader(),
      spanProcessor: new BatchSpanProcessor(traceExporter),
      textMapPropagator: new CompositePropagator({
        propagators: [
          new W3CBaggagePropagator(),
          new W3CTraceContextPropagator(),
        ],
      }),
      instrumentations: this.getInstractions(),
      serviceName: 'affine-cloud',
    });
  }
}

export class LocalOpentelemetryFactory
  extends OpentelemetryFactory
  implements OnModuleDestroy
{
  private readonly metricsExporter = new PrometheusExporter({
    metricProducers: this.getMetricsProducers(),
  });

  async onModuleDestroy() {
    await this.metricsExporter.shutdown();
  }

  override getMetricReader(): MetricReader {
    return this.metricsExporter;
  }

  override getSpanExporter(): SpanExporter {
    return new ZipkinExporter();
  }
}

function getMeterProvider() {
  return metrics.getMeterProvider();
}

export function registerCustomMetrics() {
  const hostMetricsMonitoring = new HostMetrics({
    name: 'instance-host-metrics',
    meterProvider: getMeterProvider() as MeterProvider,
  });
  hostMetricsMonitoring.start();
}

export function getMeter(name = 'business') {
  return getMeterProvider().getMeter(name);
}
