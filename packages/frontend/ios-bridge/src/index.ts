import './polyfill/dispose';
import './polyfill/intl-segmenter';
import './polyfill/request-idle-callback';
import '@affine/core/bootstrap/preload';

import { configureCommonModules } from '@affine/core/modules';
import { AuthService } from '@affine/core/modules/cloud';
import { configureLocalStorageStateStorageImpls } from '@affine/core/modules/storage';
import {
  configureBrowserWorkspaceFlavours,
  configureIndexedDBWorkspaceEngineStorageProvider,
} from '@affine/core/modules/workspace-engine';
import {
  DocsService,
  Framework,
  LifecycleService,
  type WorkspaceMetadata,
  WorkspacesService,
} from '@toeverything/infra';

const framework = new Framework();
configureCommonModules(framework);
configureLocalStorageStateStorageImpls(framework);
configureBrowserWorkspaceFlavours(framework);
configureIndexedDBWorkspaceEngineStorageProvider(framework);
const frameworkProvider = framework.provider();

// start the application
frameworkProvider.get(LifecycleService).applicationStart();

const jsb = {
  signInPassword(email: string, password: string) {
    return frameworkProvider
      .get(AuthService)
      .signInPassword({ email, password });
  },

  getWorkspacesList() {
    return frameworkProvider.get(WorkspacesService).list.workspaces$;
  },

  getWorkspacesDocs(workspaceMeta: WorkspaceMetadata) {
    return frameworkProvider
      .get(WorkspacesService)
      .open({ metadata: workspaceMeta })
      .workspace.scope.get(DocsService)
      .list.docs$.map(docs => docs.map(d => d.meta$.value));
  },
  // ... add more methods here
};

(window as any).jsb = jsb;
(window as any).workspacesService = frameworkProvider.get(WorkspacesService);
