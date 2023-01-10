import { test, expect } from '@playwright/test';
import { WorkspaceMetaCollection } from '../../workspace-meta-collection.js';
import { LocalProvider } from './local.js';
import { createBlocksuiteWorkspace } from '../../utils/index.js';
import 'fake-indexeddb/auto';

test.describe.serial('local provider', () => {
  const workspaceMetaCollection = new WorkspaceMetaCollection();
  const provider = new LocalProvider({
    workspaces: workspaceMetaCollection.createScope(),
  });

  const workspaceName = 'workspace-test';
  let workspaceId: string | undefined;

  test('create workspace', async () => {
    const workspaceInfo = await provider.createWorkspaceInfo({
      name: workspaceName,
      avatar: 'avatar-url-test',
    });
    workspaceId = workspaceInfo.id;
    const blocksuiteWorkspace = createBlocksuiteWorkspace(workspaceId);
    await provider.createWorkspace(blocksuiteWorkspace, {
      name: workspaceName,
      avatar: 'avatar-url-test',
    });

    expect(workspaceMetaCollection.workspaces.length).toEqual(1);
    expect(workspaceMetaCollection.workspaces[0].name).toEqual(workspaceName);
  });

  test('workspace list cache', async () => {
    const workspacesMetaCollection1 = new WorkspaceMetaCollection();
    const provider1 = new LocalProvider({
      workspaces: workspacesMetaCollection1.createScope(),
    });
    await provider1.loadWorkspaces();
    expect(workspacesMetaCollection1.workspaces.length).toEqual(1);
    expect(workspacesMetaCollection1.workspaces[0].name).toEqual(workspaceName);
    expect(workspacesMetaCollection1.workspaces[0].id).toEqual(workspaceId);
  });

  test('update workspace', async () => {
    await provider.updateWorkspaceMeta(workspaceId!, {
      name: '1111',
    });
    expect(workspaceMetaCollection.workspaces[0].name).toEqual('1111');
  });

  test('delete workspace', async () => {
    expect(workspaceMetaCollection.workspaces.length).toEqual(1);
    /**
     * FIXME
     * If we don't wrap setTimeout,
     * Running deleteWorkspace will crash the worker, and get error like next line:
     * InvalidStateError: An operation was called on an object on which it is not allowed or at a time when it is not allowed. Also occurs if a request is made on a source object that has been deleted or removed. Use TransactionInactiveError or ReadOnlyError when possible, as they are more specific variations of InvalidStateError.
     * */
    setTimeout(async () => {
      await provider.deleteWorkspace(workspaceMetaCollection.workspaces[0].id);
      expect(workspaceMetaCollection.workspaces.length).toEqual(0);
    }, 10);
  });
});
