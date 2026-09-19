import type { Framework } from '@toeverything/infra';

import { DesktopApiService } from '../desktop-api';
import { DocsService } from '../doc';
import { GlobalContextService } from '../global-context';
import { WorkbenchService } from '../workbench';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { MarkdownFileSyncService } from './services/markdown-file-sync';

export {
  isPlainTextMarkdownBinding,
  type MarkdownFileBinding,
  MarkdownFileSyncService,
} from './services/markdown-file-sync';
export { MarkdownFileSyncLifecycle } from './views/markdown-file-sync-lifecycle';
export { MarkdownFileSyncRouteBridge } from './views/markdown-file-sync-route-bridge';
export { MarkdownFileViewer } from './views/markdown-file-viewer';

export function configureMarkdownFileSyncModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(MarkdownFileSyncService, [
      DesktopApiService,
      DocsService,
      WorkspaceService,
      WorkbenchService,
      GlobalContextService,
    ]);
}
