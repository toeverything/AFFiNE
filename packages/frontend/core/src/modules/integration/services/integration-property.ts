import { type LiveData, Service } from '@toeverything/infra';

import type { DocService } from '../../doc';
import { INTEGRATION_PROPERTY_SCHEMA } from '../constant';
import type { IntegrationDocPropertiesMap, IntegrationType } from '../type';

export class IntegrationPropertyService extends Service {
  constructor(private readonly docService: DocService) {
    super();
  }

  integrationType$ = this.docService.doc.properties$.selector(
    p => p.integrationType
  );

  schema$ = this.docService.doc.properties$
    .selector(p => p.integrationType)
    .map(type => (type ? INTEGRATION_PROPERTY_SCHEMA[type] : null));

  integrationProperty$(
    type: IntegrationType,
    key: string
  ): LiveData<Record<string, any> | undefined | null>;
  integrationProperty$<
    T extends IntegrationType,
    Key extends keyof IntegrationDocPropertiesMap[T],
  >(type: T, key: Key) {
    return this.docService.doc.properties$.selector(
      p => p[`${type}:${key.toString()}`]
    ) as LiveData<IntegrationDocPropertiesMap[T][Key] | undefined | null>;
  }

  updateIntegrationProperties<T extends IntegrationType>(
    type: T,
    updates: Partial<IntegrationDocPropertiesMap[T]>
  ) {
    this.docService.doc.updateProperties({
      integrationType: type,
      ...Object.fromEntries(
        Object.entries(updates).map(([key, value]) => {
          return [`${type}:${key.toString()}`, value];
        })
      ),
    });
  }
}
