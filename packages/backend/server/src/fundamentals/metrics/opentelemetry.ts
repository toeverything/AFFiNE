import { Attributes, metrics } from '@opentelemetry/api';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { HostMetrics } from '@opentelemetry/host-metrics';
import { Instrumentation } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import type { MeterProvider } from '@opentelemetry/sdk-metrics';
import {
  MetricProducer,
  MetricReader,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  SpanExporter,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node';
import {
  SEMRESATTRS_K8S_CLUSTER_NAME,
  SEMRESATTRS_K8S_NAMESPACE_NAME,
  SEMRESATTRS_K8S_POD_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

import { getRegisteredInstrumentations } from './instrumentations';
import { PrismaMetricProducer } from './prisma';

function withBuiltinAttributesMetricReader(
  reader: MetricReader,
  attrs: Attributes
) {
  const collect = reader.collect;
  reader.collect = async options => {
    const result = await collect.call(reader, options);

    result.resourceMetrics.scopeMetrics.forEach(metrics => {
      metrics.metrics.forEach(metric => {
        metric.dataPoints.forEach(dataPoint => {
          // @ts-expect-error allow
          dataPoint.attributes = Object.assign({}, attrs, dataPoint.attributes);
        });
      });
    });

    return result;
  };

  return reader;
}

function withBuiltinAttributesSpanExporter(
  exporter: SpanExporter,
  attrs: Attributes
) {
  const exportSpans = exporter.export;
  exporter.export = (spans, callback) => {
    spans.forEach(span => {
      // patch span attributes
      // @ts-expect-error allow
      span.attributes = Object.assign({}, attrs, span.attributes);
    });

    return exportSpans.call(exporter, spans, callback);
  };

  return exporter;
}

export abstract class OpentelemetryFactory {
  abstract getMetricReader(): MetricReader;
  abstract getSpanExporter(): SpanExporter;

  getInstractions(): Instrumentation[] {
    return getRegisteredInstrumentations();
  }

  getMetricsProducers(): MetricProducer[] {
    return [new PrismaMetricProducer()];
  }

  getResource() {
    return new Resource({
      [SEMRESATTRS_K8S_CLUSTER_NAME]: AFFiNE.flavor.type,
      [SEMRESATTRS_K8S_NAMESPACE_NAME]: AFFiNE.AFFINE_ENV,
      [SEMRESATTRS_K8S_POD_NAME]: process.env.HOSTNAME ?? process.env.HOST,
    });
  }

  getBuiltinAttributes(): Attributes {
    return {
      [SEMRESATTRS_SERVICE_VERSION]: AFFiNE.version,
    };
  }

  create() {
    const builtinAttributes = this.getBuiltinAttributes();

    return new NodeSDK({
      resource: this.getResource(),
      sampler: new TraceIdRatioBasedSampler(0.1),
      traceExporter: withBuiltinAttributesSpanExporter(
        this.getSpanExporter(),
        builtinAttributes
      ),
      metricReader: withBuiltinAttributesMetricReader(
        this.getMetricReader(),
        builtinAttributes
      ),
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

export class LocalOpentelemetryFactory extends OpentelemetryFactory {
  override getMetricReader() {
    return new PeriodicExportingMetricReader({
      // requires jeager service running in 'http://localhost:4318'
      // with metrics feature enabled.
      // see https://www.jaegertracing.io/docs/1.56/spm
      exporter: new OTLPMetricExporter(),
    });
  }

  override getSpanExporter() {
    // requires jeager service running in 'http://localhost:4318'
    return new OTLPTraceExporter();
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
