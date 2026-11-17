import { type Framework } from '@toeverything/infra';

import { DocScope, DocService, DocsService } from '../doc';
import { TemplateDocService } from '../template-doc';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { JournalService } from './services/journal';
import { JournalDocService } from './services/journal-doc';
import { JournalTodoDatabaseService } from './services/journal-todo-database';
import { JournalStore } from './store/journal';
import { JournalTodoDatabaseStore } from './store/journal-todo-database';

export {
  JOURNAL_DATE_FORMAT,
  JournalService,
  type MaybeDate,
} from './services/journal';
export { JournalDocService } from './services/journal-doc';
export { JournalTodoDatabaseService } from './services/journal-todo-database';
export type { JournalTodoDatabaseRef } from './store/journal-todo-database';
export { suggestJournalDate } from './suggest-journal-date';

export function configureJournalModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(JournalService, [JournalStore, DocsService, TemplateDocService])
    .store(JournalStore, [DocsService])
    .service(JournalTodoDatabaseService, [JournalTodoDatabaseStore])
    .store(JournalTodoDatabaseStore, [WorkspaceService])
    .scope(DocScope)
    .service(JournalDocService, [DocService, JournalService]);
}
