export { Doc } from './entities/doc';
export type { DocMode } from './entities/record';
export { DocRecord } from './entities/record';
export { DocRecordList } from './entities/record-list';
export { DocScope } from './scopes/doc';
export { DocService } from './services/doc';
export { DocsService } from './services/docs';

import type { Framework } from '../../framework';
import {
  WorkspaceLocalState,
  WorkspaceScope,
  WorkspaceService,
} from '../workspace';
import { Doc } from './entities/doc';
import { DocRecord } from './entities/record';
import { DocRecordList } from './entities/record-list';
import { DocScope } from './scopes/doc';
import { DocService } from './services/doc';
import { DocsService } from './services/docs';
import { DocsStoreService } from './services/docs-store';

export function configureDocModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(DocsService, [DocsStoreService])
    .service(DocsStoreService, [WorkspaceService, WorkspaceLocalState])
    .entity(DocRecord, [DocsStoreService])
    .entity(DocRecordList, [DocsStoreService])
    .scope(DocScope)
    .entity(Doc, [DocScope])
    .service(DocService);
}
