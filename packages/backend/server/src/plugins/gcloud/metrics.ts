import { MetricExporter } from '@google-cloud/opentelemetry-cloud-monitoring-exporter';
import { TraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';
import { GcpDetectorSync } from '@google-cloud/opentelemetry-resource-util';
import { Global, Injectable, Module, Provider } from '@nestjs/common';
import { getEnv } from '@opentelemetry/core';
import { Resource } from '@opentelemetry/resources';
import {
  MetricReader,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { SpanExporter } from '@opentelemetry/sdk-trace-node';
import {
  SEMRESATTRS_CONTAINER_NAME,
  SEMRESATTRS_K8S_POD_NAME,
} from '@opentelemetry/semantic-conventions';

import { OpentelemetryOptionsFactory } from '../../base/metrics';

@Injectable()
export class GCloudOpentelemetryOptionsFactory extends OpentelemetryOptionsFactory {
  override getResource(): Resource {
    const env = getEnv();
    return super
      .getResource()
      .merge(
        new Resource({
          [SEMRESATTRS_K8S_POD_NAME]: env.HOSTNAME,
          [SEMRESATTRS_CONTAINER_NAME]: env.CONTAINER_NAME,
        })
      )
      .merge(new GcpDetectorSync().detect());
  }

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

const FactorProvider: Provider = {
  provide: OpentelemetryOptionsFactory,
  useClass: GCloudOpentelemetryOptionsFactory,
};

@Global()
@Module({
  providers: [FactorProvider],
  exports: [FactorProvider],
})
export class GCloudMetrics {}
