import { WorkspaceFlavour } from '@affine/env/workspace';
import { describe, expect, test } from 'vitest';

import { configureInfraServices, configureTestingInfraServices } from '../..';
import { ServiceCollection } from '../../di';
import { WorkspaceManager } from '../../workspace';
import { PageListService } from '..';

describe('Page System', () => {
  test('basic', async () => {
    const services = new ServiceCollection();
    configureInfraServices(services);
    configureTestingInfraServices(services);

    const provider = services.provider();
    const workspaceManager = provider.get(WorkspaceManager);

    const { workspace } = workspaceManager.open(
      await workspaceManager.createWorkspace(WorkspaceFlavour.LOCAL)
    );

    const pageListService = workspace.services.get(PageListService);
    expect(pageListService.pages.value.length).toBe(0);

    workspace.blockSuiteWorkspace.createPage({
      id: 'page0',
    });

    expect(pageListService.pages.value.length).toBe(1);
  });
});
