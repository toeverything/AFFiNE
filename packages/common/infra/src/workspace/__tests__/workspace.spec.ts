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

    const page = workspace.blockSuiteWorkspace.createPage({
      id: 'page0',
    });
    await page.load();
    page.addBlock('affine:page', {
      title: new page.Text('test-page'),
    });

    expect(workspace.blockSuiteWorkspace.pages.size).toBe(1);
    expect(
      (page!.getBlockByFlavour('affine:page')[0] as any).title.toString()
    ).toBe('test-page');
  });
});
