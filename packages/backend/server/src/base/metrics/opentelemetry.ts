import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { Instrumentation } from '@opentelemetry/instrumentation';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { SocketIoInstrumentation } from '@opentelemetry/instrumentation-socket.io';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { IMetricReader, MetricProducer } from '@opentelemetry/sdk-metrics';
import { NodeSDK, NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  SpanExporter,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node';
import {
  ATTR_K8S_NAMESPACE_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions/incubating';
import { PrismaInstrumentation } from '@prisma/instrumentation';

import { Config } from '../config';
import { OnEvent } from '../event/def';
import { registerCustomMetrics } from './metrics';
import { PrismaMetricProducer } from './prisma';

export abstract class BaseOpentelemetryOptionsFactory {
  abstract getMetricReader(): IMetricReader;
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
    return resourceFromAttributes({
      [ATTR_K8S_NAMESPACE_NAME]: env.NAMESPACE,
      [ATTR_SERVICE_NAME]: env.FLAVOR,
      [ATTR_SERVICE_VERSION]: env.version,
    });
  }

  create(): Partial<NodeSDKConfiguration> {
    const traceExporter = this.getSpanExporter();
    return {
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
    };
  }
}

@Injectable()
export class OpentelemetryOptionsFactory extends BaseOpentelemetryOptionsFactory {
  override getMetricReader(): IMetricReader {
    return new PrometheusExporter({
      metricProducers: this.getMetricsProducers(),
    });
  }

  override getSpanExporter(): SpanExporter {
    return new ZipkinExporter();
  }
}

@Injectable()
export class OpentelemetryProvider {
  readonly #logger = new Logger(OpentelemetryProvider.name);
  #sdk: NodeSDK | null = null;

  constructor(
    private readonly config: Config,
    private readonly ref: ModuleRef
  ) {}

  @OnEvent('config.init')
  async init(event: Events['config.init']) {
    if (env.flavors.script) {
      return;
    }
    if (event.config.metrics.enabled) {
      await this.setup();
      registerCustomMetrics();
    }
  }

  @OnEvent('config.changed')
  async onConfigChanged(event: Events['config.changed']) {
    if ('metrics' in event.updates) {
      await this.setup();
    }
  }

  async onModuleDestroy() {
    await this.#sdk?.shutdown();
  }

  private async setup() {
    if (this.config.metrics.enabled) {
      if (!this.#sdk) {
        const factory = this.ref.get(OpentelemetryOptionsFactory, {
          strict: false,
        });
        this.#sdk = new NodeSDK(factory.create());
      }

      this.#sdk.start();
      this.#logger.log('OpenTelemetry SDK started');
    } else {
      await this.#sdk?.shutdown();
      this.#sdk = null;
      this.#logger.log('OpenTelemetry SDK stopped');
    }
  }
}
