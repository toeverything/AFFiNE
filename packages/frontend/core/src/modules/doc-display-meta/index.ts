import {
  DocsService,
  type Framework,
  WorkspaceScope,
} from '@toeverything/infra';

import { WorkspacePropertiesAdapter } from '../properties';
import { DocDisplayMetaService } from './services/doc-display-meta';

export { DocDisplayMetaService };

export function configureDocDisplayMetaModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(DocDisplayMetaService, [WorkspacePropertiesAdapter, DocsService]);
}
