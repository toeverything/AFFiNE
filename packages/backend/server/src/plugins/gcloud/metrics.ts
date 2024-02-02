import { MetricExporter } from '@google-cloud/opentelemetry-cloud-monitoring-exporter';
import { TraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';
import { GcpDetectorSync } from '@google-cloud/opentelemetry-resource-util';
import { Global, Provider } from '@nestjs/common';
import { Resource } from '@opentelemetry/resources';
import {
  MetricReader,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { SpanExporter } from '@opentelemetry/sdk-trace-node';

import { OptionalModule } from '../../fundamentals';
import { OpentelemetryFactory } from '../../fundamentals/metrics';

export class GCloudOpentelemetryFactory extends OpentelemetryFactory {
  override getResource(): Resource {
    return super.getResource().merge(new GcpDetectorSync().detect());
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

const factorProvider: Provider = {
  provide: OpentelemetryFactory,
  useFactory: () => new GCloudOpentelemetryFactory(),
};

@Global()
@OptionalModule({
  if: config => config.metrics.enabled,
  overrides: [factorProvider],
})
export class GCloudMetrics {}
