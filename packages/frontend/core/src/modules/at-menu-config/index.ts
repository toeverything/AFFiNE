import { type Framework } from '@toeverything/infra';

import { WorkspaceServerService } from '../cloud';
import { WorkspaceDialogService } from '../dialogs';
import { DocScope, DocsService } from '../doc';
import { DocDisplayMetaService } from '../doc-display-meta';
import { JournalService } from '../journal';
import { GuardService, MemberSearchService } from '../permissions';
import { DocGrantedUsersService } from '../permissions/services/doc-granted-users';
import { SearchMenuService } from '../search-menu/services';
import { WorkspaceScope } from '../workspace';
import { AtMenuConfigService } from './services';

export function configAtMenuConfigModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .scope(DocScope)
    .service(AtMenuConfigService, [
      JournalService,
      DocDisplayMetaService,
      WorkspaceDialogService,
      DocsService,
      SearchMenuService,
      WorkspaceServerService,
      MemberSearchService,
      GuardService,
      DocGrantedUsersService,
    ]);
}
