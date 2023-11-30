import { MetricExporter } from '@google-cloud/opentelemetry-cloud-monitoring-exporter';
import { TraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';
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
import {
  ConsoleMetricExporter,
  type MeterProvider,
  MetricProducer,
  MetricReader,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SpanExporter,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node';
import { PrismaInstrumentation } from '@prisma/instrumentation';

import { PrismaMetricProducer } from './prisma';

abstract class OpentelemetryFactor {
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

  create() {
    const traceExporter = this.getSpanExporter();
    return new NodeSDK({
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

class GCloudOpentelemetryFactor extends OpentelemetryFactor {
  override getMetricReader(): MetricReader {
    return new PeriodicExportingMetricReader({
      exportIntervalMillis: 30000,
      exportTimeoutMillis: 10000,
      exporter: new MetricExporter({
        prefix: 'custom.googleapis.com',
      }),
      metricProducers: this.getMetricsProducers(),
    });
  }

  override getSpanExporter(): SpanExporter {
    return new TraceExporter();
  }
}

class LocalOpentelemetryFactor extends OpentelemetryFactor {
  override getMetricReader(): MetricReader {
    return new PrometheusExporter({
      metricProducers: this.getMetricsProducers(),
    });
  }

  override getSpanExporter(): SpanExporter {
    return new ZipkinExporter();
  }
}

class DebugOpentelemetryFactor extends OpentelemetryFactor {
  override getMetricReader(): MetricReader {
    return new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(),
      metricProducers: this.getMetricsProducers(),
    });
  }

  override getSpanExporter(): SpanExporter {
    return new ConsoleSpanExporter();
  }
}

function createSDK() {
  let factor: OpentelemetryFactor | null = null;
  if (process.env.NODE_ENV === 'production') {
    factor = new GCloudOpentelemetryFactor();
  } else if (process.env.DEBUG_METRICS) {
    factor = new DebugOpentelemetryFactor();
  } else {
    factor = new LocalOpentelemetryFactor();
  }

  return factor?.create();
}

let OPENTELEMETRY_STARTED = false;

function ensureStarted() {
  if (!OPENTELEMETRY_STARTED) {
    OPENTELEMETRY_STARTED = true;
    start();
  }
}

function getMeterProvider() {
  ensureStarted();
  return metrics.getMeterProvider();
}

function registerCustomMetrics() {
  const hostMetricsMonitoring = new HostMetrics({
    name: 'instance-host-metrics',
    meterProvider: getMeterProvider() as MeterProvider,
  });
  hostMetricsMonitoring.start();
}

export function getMeter(name = 'business') {
  return getMeterProvider().getMeter(name);
}

export function start() {
  const sdk = createSDK();

  if (sdk) {
    sdk.start();
    registerCustomMetrics();
  }
}
