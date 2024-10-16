import {
  DocScope,
  DocService,
  DocsService,
  type Framework,
  WorkspaceScope,
} from '@toeverything/infra';

import { JournalService } from './services/journal';
import { JournalDocService } from './services/journal-doc';
import { JournalStore } from './store/journal';

export { JournalService } from './services/journal';
export { JournalDocService } from './services/journal-doc';

export function configureJournalModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(JournalService, [JournalStore])
    .store(JournalStore, [DocsService])
    .scope(DocScope)
    .service(JournalDocService, [DocService, JournalService]);
}
