import { test, expect } from '@playwright/test';
import { AffineProvider } from '../affine.js';
// import { Workspaces } from '../../../workspaces/index.js';
import { apis } from './mock-apis.js';
import 'fake-indexeddb/auto';

// TODO: we should find a better way for testing AffineProvider.

test.describe.serial('affine provider', async () => {
  // const workspaces = new Workspaces();
  // const provider = new AffineProvider({
  //   workspaces: workspaces.createScope(),
  //   apis,
  // });
  // await provider.auth();
  // const workspaceName = 'workspace-test';
  // let workspaceId: string | undefined;
  // test('create workspace', async () => {
  //   const w = await provider.createWorkspace({
  //     name: workspaceName,
  //     avatar: 'avatar-url-test',
  //   });
  //   workspaceId = w?.room;
  //   expect(workspaces.workspaces.length).toEqual(1);
  //   expect(workspaces.workspaces[0].name).toEqual(workspaceName);
  // });
  // test('workspace list cache', async () => {
  //   const workspaces1 = new Workspaces();
  //   const provider1 = new AffineProvider({
  //     workspaces: workspaces1.createScope(),
  //   });
  //   await provider1.loadWorkspaces();
  //   expect(workspaces1.workspaces.length).toEqual(1);
  //   expect(workspaces1.workspaces[0].name).toEqual(workspaceName);
  //   expect(workspaces1.workspaces[0].id).toEqual(workspaceId);
  // });
  // test('update workspace', async () => {
  //   await provider.updateWorkspaceMeta(workspaceId!, {
  //     name: '1111',
  //   });
  //   expect(workspaces.workspaces[0].name).toEqual('1111');
  // });
  // test('delete workspace', async () => {
  //   expect(workspaces.workspaces.length).toEqual(1);
  //   await provider.deleteWorkspace(workspaces.workspaces[0].id);
  //   expect(workspaces.workspaces.length).toEqual(0);
  // });
});
