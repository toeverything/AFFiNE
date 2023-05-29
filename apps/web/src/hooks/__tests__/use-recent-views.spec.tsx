/**
 * @vitest-environment happy-dom
 */
import {
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import type { LocalWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { useRouter } from 'next/router';
import routerMock from 'next-router-mock';
import { createDynamicRouteParser } from 'next-router-mock/dynamic-routes';
import type { FC, PropsWithChildren } from 'react';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { LocalAdapter } from '../../adapters/local';
import { workspacesAtom } from '../../atoms';
import { BlockSuiteWorkspace } from '../../shared';
import { WorkspaceSubPath } from '../../shared';
import {
  currentWorkspaceAtom,
  useCurrentWorkspace,
} from '../current/use-current-workspace';
import {
  useRecentlyViewed,
  useSyncRecentViewsWithRouter,
} from '../use-recent-views';

let blockSuiteWorkspace: BlockSuiteWorkspace;
beforeAll(() => {
  routerMock.useParser(
    createDynamicRouteParser([
      `/workspace/[workspaceId/${WorkspaceSubPath.ALL}`,
      `/workspace/[workspaceId/${WorkspaceSubPath.SETTING}`,
      `/workspace/[workspaceId/${WorkspaceSubPath.TRASH}`,
      '/workspace/[workspaceId]/[pageId]',
    ])
  );
});

async function getJotaiContext() {
  const store = createStore();
  const ProviderWrapper: FC<PropsWithChildren> = function ProviderWrapper({
    children,
  }) {
    return <Provider store={store}>{children}</Provider>;
  };
  const workspaces = await store.get(workspacesAtom);
  expect(workspaces.length).toBe(0);
  return {
    store,
    ProviderWrapper,
    initialWorkspaces: workspaces,
  } as const;
}

beforeEach(async () => {
  blockSuiteWorkspace = new BlockSuiteWorkspace({ id: 'test' })
    .register(AffineSchemas)
    .register(__unstableSchemas);
  const initPage = (page: Page) => {
    expect(page).not.toBeNull();
    assertExists(page);
    const pageBlockId = page.addBlock('affine:page', {
      title: new page.Text(''),
    });
    const frameId = page.addBlock('affine:frame', {}, pageBlockId);
    page.addBlock('affine:paragraph', {}, frameId);
  };
  initPage(
    blockSuiteWorkspace.createPage({
      id: 'page0',
    })
  );
  initPage(blockSuiteWorkspace.createPage({ id: 'page1' }));
  initPage(blockSuiteWorkspace.createPage({ id: 'page2' }));
});

describe('useRecentlyViewed', () => {
  test('basic', async () => {
    const { ProviderWrapper, store } = await getJotaiContext();
    const workspaceId = blockSuiteWorkspace.id;
    const pageId = 'page0';
    store.set(rootWorkspacesMetadataAtom, [
      {
        id: workspaceId,
        flavour: WorkspaceFlavour.LOCAL,
      },
    ]);
    LocalAdapter.CRUD.get = vi.fn().mockResolvedValue({
      id: workspaceId,
      flavour: WorkspaceFlavour.LOCAL,
      blockSuiteWorkspace,
      providers: [],
    } satisfies LocalWorkspace);
    store.set(rootCurrentWorkspaceIdAtom, blockSuiteWorkspace.id);
    const workspace = await store.get(currentWorkspaceAtom);
    expect(workspace?.id).toBe(blockSuiteWorkspace.id);
    const currentHook = renderHook(() => useCurrentWorkspace(), {
      wrapper: ProviderWrapper,
    });
    expect(currentHook.result.current[0]?.id).toEqual(workspaceId);
    store.set(rootCurrentWorkspaceIdAtom, blockSuiteWorkspace.id);
    await store.get(currentWorkspaceAtom);
    const recentlyViewedHook = renderHook(() => useRecentlyViewed(), {
      wrapper: ProviderWrapper,
    });
    expect(recentlyViewedHook.result.current).toEqual([]);
    const routerHook = renderHook(() => useRouter(), {
      wrapper: ProviderWrapper,
    });
    await routerHook.result.current.push({
      pathname: '/workspace/[workspaceId]/[pageId]',
      query: {
        workspaceId,
        pageId,
      },
    });
    routerHook.rerender();
    const syncHook = renderHook(
      router => useSyncRecentViewsWithRouter(router, blockSuiteWorkspace),
      {
        wrapper: ProviderWrapper,
        initialProps: routerHook.result.current,
      }
    );
    syncHook.rerender(routerHook.result.current);
    expect(recentlyViewedHook.result.current).toEqual([
      {
        id: 'page0',
        mode: 'page',
      },
    ]);
  });
});
