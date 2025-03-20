import { type Framework } from '@toeverything/infra';

import { WorkspaceDialogService } from '../dialogs';
import { DocsService } from '../doc';
import { DocDisplayMetaService } from '../doc-display-meta';
import { EditorSettingService } from '../editor-setting';
import { JournalService } from '../journal';
import { SearchMenuService } from '../search-menu/services';
import { WorkspaceScope } from '../workspace';
import { AtMenuConfigService } from './services';

export function configAtMenuConfigModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(AtMenuConfigService, [
      JournalService,
      DocDisplayMetaService,
      WorkspaceDialogService,
      EditorSettingService,
      DocsService,
      SearchMenuService,
    ]);
}
