import { type Framework, WorkspaceScope } from '@toeverything/infra';

import { DocInfoModal } from './entities/modal';
import { DocInfoService } from './services/doc-info';

export { DocInfoService };

export function configureDocInfoModule(framework: Framework) {
  framework.scope(WorkspaceScope).service(DocInfoService).entity(DocInfoModal);
}
