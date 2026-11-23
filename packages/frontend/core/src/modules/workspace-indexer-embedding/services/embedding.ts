import { Service } from '@toeverything/infra';

import { AdditionalAttachments } from '../entities/additional-attachments';
import { EmbeddingEnabled } from '../entities/embedding-enabled';
import { EmbeddingProgress } from '../entities/embedding-progress';
import { IgnoredDocs } from '../entities/ignored-docs';

export class EmbeddingService extends Service {
  embeddingEnabled = this.framework.createEntity(EmbeddingEnabled);
  additionalAttachments = this.framework.createEntity(AdditionalAttachments);
  ignoredDocs = this.framework.createEntity(IgnoredDocs);
  embeddingProgress = this.framework.createEntity(EmbeddingProgress);
}
