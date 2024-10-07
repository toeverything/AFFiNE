export { Doc } from './entities/doc';
export { DocRecord } from './entities/record';
export { DocRecordList } from './entities/record-list';
export { DocScope } from './scopes/doc';
export { DocService } from './services/doc';
export { DocsService } from './services/docs';

import type { Framework } from '../../framework';
import { WorkspaceDBService } from '../db';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { Doc } from './entities/doc';
import { DocPropertyList } from './entities/property-list';
import { DocRecord } from './entities/record';
import { DocRecordList } from './entities/record-list';
import { DocScope } from './scopes/doc';
import { DocService } from './services/doc';
import { DocsService } from './services/docs';
import { DocPropertiesStore } from './stores/doc-properties';
import { DocsStore } from './stores/docs';

export function configureDocModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(DocsService, [DocsStore])
    .store(DocPropertiesStore, [WorkspaceService, WorkspaceDBService])
    .store(DocsStore, [WorkspaceService, DocPropertiesStore])
    .entity(DocRecord, [DocsStore, DocPropertiesStore])
    .entity(DocRecordList, [DocsStore])
    .entity(DocPropertyList, [DocPropertiesStore])
    .scope(DocScope)
    .entity(Doc, [DocScope, DocsStore, WorkspaceService])
    .service(DocService);
}
