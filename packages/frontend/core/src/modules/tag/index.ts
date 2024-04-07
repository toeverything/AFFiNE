export { Tag } from './entities/tag';
export { tagColorMap } from './entities/utils';
export { TagService } from './service/tag';
export { DeleteTagConfirmModal } from './view/delete-tag-modal';

import {
  DocsService,
  type Framework,
  WorkspaceScope,
} from '@toeverything/infra';

import { WorkspaceLegacyProperties } from '../properties';
import { Tag } from './entities/tag';
import { TagList } from './entities/tag-list';
import { TagService } from './service/tag';
import { TagStoreService } from './service/tag-store';

export function configureTagModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(TagService)
    .service(TagStoreService, [WorkspaceLegacyProperties])
    .entity(TagList, [TagStoreService, DocsService])
    .entity(Tag, [TagStoreService, DocsService]);
}
