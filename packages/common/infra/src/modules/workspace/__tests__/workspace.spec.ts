import { WorkspaceFlavour } from '@affine/env/workspace';
import { describe, expect, test } from 'vitest';

import { Framework } from '../../../framework';
import { configureTestingGlobalStorage } from '../../storage';
import {
  configureTestingWorkspaceProvider,
  configureWorkspaceModule,
  Workspace,
  WorkspacesService,
} from '..';

describe('Workspace System', () => {
  test('create workspace', async () => {
    const framework = new Framework();
    configureTestingGlobalStorage(framework);
    configureWorkspaceModule(framework);
    configureTestingWorkspaceProvider(framework);

    const provider = framework.provider();
    const workspaceService = provider.get(WorkspacesService);
    expect(workspaceService.list.workspaces$.value.length).toBe(0);

    const workspace = workspaceService.open({
      metadata: await workspaceService.create(WorkspaceFlavour.LOCAL),
    });

    expect(workspace.workspace).toBeInstanceOf(Workspace);

    expect(workspaceService.list.workspaces$.value.length).toBe(1);
  });
});
