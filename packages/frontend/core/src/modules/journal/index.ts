import { type Framework } from '@toeverything/infra';

import { DocScope, DocService, DocsService } from '../doc';
import { TemplateDocService } from '../template-doc';
import { WorkspaceScope } from '../workspace';
import { JournalService } from './services/journal';
import { JournalDocService } from './services/journal-doc';
import { JournalStore } from './store/journal';

export {
  JOURNAL_DATE_FORMAT,
  JournalService,
  type MaybeDate,
} from './services/journal';
export { JournalDocService } from './services/journal-doc';
export { suggestJournalDate } from './suggest-journal-date';

export function configureJournalModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(JournalService, [JournalStore, DocsService, TemplateDocService])
    .store(JournalStore, [DocsService])
    .scope(DocScope)
    .service(JournalDocService, [DocService, JournalService]);
}
