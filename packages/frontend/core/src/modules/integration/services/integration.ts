import { LiveData, Service } from '@toeverything/infra';

import { ReadwiseIntegration } from '../entities/readwise';
import { IntegrationWriter } from '../entities/writer';

export class IntegrationService extends Service {
  writer = this.framework.createEntity(IntegrationWriter);
  readwise = this.framework.createEntity(ReadwiseIntegration, {
    writer: this.writer,
  });

  constructor() {
    super();
  }

  importing$ = LiveData.computed(get => {
    return get(this.readwise.importing$);
  });
}
