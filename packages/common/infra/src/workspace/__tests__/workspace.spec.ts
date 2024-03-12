import { WorkspaceFlavour } from '@affine/env/workspace';
import { describe, expect, test } from 'vitest';

import { configureInfraServices, configureTestingInfraServices } from '../..';
import { ServiceCollection } from '../../di';
import { WorkspaceListService, WorkspaceManager } from '../';

describe('Workspace System', () => {
  test('create workspace', async () => {
    const services = new ServiceCollection();
    configureInfraServices(services);
    configureTestingInfraServices(services);

    const provider = services.provider();
    const workspaceManager = provider.get(WorkspaceManager);
    const workspaceListService = provider.get(WorkspaceListService);
    expect(workspaceListService.workspaceList.value.length).toBe(0);

    const { workspace } = workspaceManager.open(
      await workspaceManager.createWorkspace(WorkspaceFlavour.LOCAL)
    );

    expect(workspaceListService.workspaceList.value.length).toBe(1);

    const page = workspace.blockSuiteWorkspace.createDoc({
      id: 'page0',
    });
    page.load();
    page.addBlock('affine:page' as keyof BlockSuite.BlockModels, {
      title: new page.Text('test-page'),
    });

    expect(workspace.blockSuiteWorkspace.docs.size).toBe(1);
    expect(
      (page!.getBlockByFlavour('affine:page')[0] as any).title.toString()
    ).toBe('test-page');
  });
});
