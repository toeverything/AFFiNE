import { TraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';
import { GcpDetectorSync } from '@google-cloud/opentelemetry-resource-util';
import { Global, Injectable, Module, Provider } from '@nestjs/common';
import {
  type Resource,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import { SpanExporter } from '@opentelemetry/sdk-trace-node';
import {
  ATTR_CONTAINER_NAME,
  ATTR_K8S_POD_NAME,
} from '@opentelemetry/semantic-conventions/incubating';

import { OpentelemetryOptionsFactory } from '../../base/metrics';

@Injectable()
export class GCloudOpentelemetryOptionsFactory extends OpentelemetryOptionsFactory {
  override getResource(): Resource {
    const envAttrs: Record<string, string> = {};
    if (process.env.HOSTNAME) {
      envAttrs[ATTR_K8S_POD_NAME] = process.env.HOSTNAME;
    }
    if (process.env.CONTAINER_NAME) {
      envAttrs[ATTR_CONTAINER_NAME] = process.env.CONTAINER_NAME;
    }

    const detected = new GcpDetectorSync().detect();

    return super
      .getResource()
      .merge(resourceFromAttributes(envAttrs))
      .merge(resourceFromAttributes(detected.attributes ?? {}));
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
