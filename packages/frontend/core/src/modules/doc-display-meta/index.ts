import {
  DocsService,
  FeatureFlagService,
  type Framework,
  WorkspaceScope,
} from '@toeverything/infra';

import { JournalService } from '../journal';
import { DocDisplayMetaService } from './services/doc-display-meta';

export { DocDisplayMetaService };

export function configureDocDisplayMetaModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(DocDisplayMetaService, [
      JournalService,
      DocsService,
      FeatureFlagService,
    ]);
}
