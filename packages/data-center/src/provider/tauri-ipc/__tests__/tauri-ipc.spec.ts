import 'fake-indexeddb/auto';

import { describe, expect, test } from 'vitest';

import { MessageCenter } from '../../../message';
import { WorkspaceUnitCollection } from '../../../workspace-unit-collection';
import { TauriIPCProvider } from '..';
import * as ipcMethods from './mock-apis';

describe('tauri-ipc provider', async () => {
  const workspaceMetaCollection = new WorkspaceUnitCollection();
  const provider = new TauriIPCProvider({
    workspaces: workspaceMetaCollection.createScope(),
    messageCenter: new MessageCenter(),
  });
  provider.init(ipcMethods);

  const workspaceName = 'workspace-test';
  let workspaceId: string | undefined;

  test('create workspace', async () => {
    const workspaceUnit = await provider.createWorkspace({
      name: workspaceName,
    });
    workspaceId = workspaceUnit?.id;

    expect(workspaceMetaCollection.workspaces.length).toEqual(1);
    expect(workspaceMetaCollection.workspaces[0].name).toEqual(workspaceName);
  });

  test('workspace list', async () => {
    const workspacesMetaCollection1 = new WorkspaceUnitCollection();
    const provider1 = new TauriIPCProvider({
      workspaces: workspacesMetaCollection1.createScope(),
      messageCenter: new MessageCenter(),
    });
    provider1.init(ipcMethods);

    await provider1.getUserInfo();
    await provider1.loadWorkspaces();
    expect(workspacesMetaCollection1.workspaces.length).toEqual(0);
    await provider1.createWorkspace({
      name: workspaceName,
    });
    expect(workspacesMetaCollection1.workspaces[0].name).toEqual(workspaceName);
    expect(workspacesMetaCollection1.workspaces[0].id).toEqual(workspaceId);
  });

  test('update workspace', async () => {
    await provider.updateWorkspaceMeta(workspaceId!, {
      name: '1111',
    });
    expect(workspaceMetaCollection.workspaces[0].name).toEqual('1111');
  });
});
