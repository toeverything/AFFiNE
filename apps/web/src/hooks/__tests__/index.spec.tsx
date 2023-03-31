/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import assert from 'node:assert';

import { jotaiWorkspacesAtom } from '@affine/workspace/atom';
import type { LocalWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import type { PageBlockModel } from '@blocksuite/blocks';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { render, renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { useRouter } from 'next/router';
import routerMock from 'next-router-mock';
import { createDynamicRouteParser } from 'next-router-mock/dynamic-routes';
import type React from 'react';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { currentWorkspaceIdAtom, workspacesAtom } from '../../atoms';
import { LocalPlugin } from '../../plugins/local';
import { BlockSuiteWorkspace, WorkspaceSubPath } from '../../shared';
import {
  useGuideHidden,
  useGuideHiddenUntilNextUpdate,
  useLastVersion,
  useTipsDisplayStatus,
} from '../affine/use-is-first-load';
import {
  useRecentlyViewed,
  useSyncRecentViewsWithRouter,
} from '../affine/use-recent-views';
import {
  currentWorkspaceAtom,
  useCurrentWorkspace,
} from '../current/use-current-workspace';
import { useBlockSuiteWorkspaceName } from '../use-blocksuite-workspace-name';
import { usePageMeta, usePageMetaHelper } from '../use-page-meta';
import {
  REDIRECT_TIMEOUT,
  useSyncRouterWithCurrentWorkspaceAndPage,
} from '../use-sync-router-with-current-workspace-and-page';
import { useWorkspaces, useWorkspacesHelper } from '../use-workspaces';

vi.mock(
  '../../components/blocksuite/header/editor-mode-switch/CustomLottie',
  () => ({
    default: (props: React.PropsWithChildren) => <>{props.children}</>,
  })
);

let blockSuiteWorkspace: BlockSuiteWorkspace;
beforeAll(() => {
  routerMock.useParser(
    createDynamicRouteParser([
      `/workspace/[workspaceId/${WorkspaceSubPath.ALL}`,
      `/workspace/[workspaceId/${WorkspaceSubPath.SETTING}`,
      `/workspace/[workspaceId/${WorkspaceSubPath.TRASH}`,
      `/workspace/[workspaceId/${WorkspaceSubPath.FAVORITE}`,
      '/workspace/[workspaceId]/[pageId]',
    ])
  );
});

beforeEach(() => {
  localStorage.clear();
});

async function getJotaiContext() {
  const store = createStore();
  const ProviderWrapper: React.FC<React.PropsWithChildren> =
    function ProviderWrapper({ children }) {
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
  initPage(blockSuiteWorkspace.createPage('page0'));
  initPage(blockSuiteWorkspace.createPage('page1'));
  initPage(blockSuiteWorkspace.createPage('page2'));
});

describe('usePageMetas', async () => {
  test('basic', async () => {
    const Component = () => {
      const pageMetas = usePageMeta(blockSuiteWorkspace);
      return (
        <div>
          {pageMetas.map(meta => (
            <div key={meta.id}>{meta.id}</div>
          ))}
        </div>
      );
    };
    const result = render(<Component />);
    await result.findByText('page0');
    await result.findByText('page1');
    await result.findByText('page2');
    expect(result.asFragment()).toMatchSnapshot();
  });

  test('mutation', () => {
    const { result, rerender } = renderHook(() =>
      usePageMeta(blockSuiteWorkspace)
    );
    expect(result.current.length).toBe(3);
    expect(result.current[0].mode).not.exist;
    const { result: result2 } = renderHook(() =>
      usePageMetaHelper(blockSuiteWorkspace)
    );
    result2.current.setPageMeta('page0', {
      mode: 'edgeless',
    });
    rerender();
    expect(result.current[0].mode).exist;
    expect(result.current[0].mode).toBe('edgeless');
    result2.current.setPageMeta('page0', {
      mode: 'page',
    });
    rerender();
    expect(result.current[0].mode).toBe('page');
  });

  test('update title', () => {
    const { result, rerender } = renderHook(() =>
      usePageMeta(blockSuiteWorkspace)
    );
    expect(result.current.length).toBe(3);
    expect(result.current[0].mode).not.exist;
    const pageMetaHelperHook = renderHook(() =>
      usePageMetaHelper(blockSuiteWorkspace)
    );
    expect(result.current[0].title).toBe('');
    pageMetaHelperHook.result.current.setPageTitle('page0', 'test');
    rerender();
    const page = blockSuiteWorkspace.getPage('page0');
    assertExists(page);
    const pageBlocks = page.getBlockByFlavour('affine:page');
    expect(pageBlocks.length).toBe(1);
    const pageBlock = pageBlocks[0] as PageBlockModel;
    expect(pageBlock.title.toString()).toBe('test');
    expect(result.current[0].title).toBe('test');
  });
});

describe('useWorkspacesHelper', () => {
  test('basic', async () => {
    const { ProviderWrapper, store } = await getJotaiContext();
    const workspaceHelperHook = renderHook(() => useWorkspacesHelper(), {
      wrapper: ProviderWrapper,
    });
    const id = await workspaceHelperHook.result.current.createLocalWorkspace(
      'test'
    );
    const workspaces = await store.get(workspacesAtom);
    expect(workspaces.length).toBe(1);
    expect(workspaces[0].id).toBe(id);
    const workspacesHook = renderHook(() => useWorkspaces(), {
      wrapper: ProviderWrapper,
    });
    await store.get(currentWorkspaceAtom);
    const currentWorkspaceHook = renderHook(() => useCurrentWorkspace(), {
      wrapper: ProviderWrapper,
    });
    currentWorkspaceHook.result.current[1](workspacesHook.result.current[0].id);
  });
});

describe('useWorkspaces', () => {
  test('basic', async () => {
    const { ProviderWrapper } = await getJotaiContext();
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: ProviderWrapper,
    });
    expect(result.current).toEqual([]);
  });

  test('mutation', async () => {
    const { ProviderWrapper, store } = await getJotaiContext();
    const { result } = renderHook(() => useWorkspacesHelper(), {
      wrapper: ProviderWrapper,
    });
    await result.current.createLocalWorkspace('test');
    const workspaces = await store.get(workspacesAtom);
    console.log(workspaces);
    expect(workspaces.length).toEqual(1);
    const { result: result2 } = renderHook(() => useWorkspaces(), {
      wrapper: ProviderWrapper,
    });
    expect(result2.current.length).toEqual(1);
    const firstWorkspace = result2.current[0];
    expect(firstWorkspace.flavour).toBe('local');
    assert(firstWorkspace.flavour === WorkspaceFlavour.LOCAL);
    expect(firstWorkspace.blockSuiteWorkspace.meta.name).toBe('test');
  });
});

describe('useSyncRouterWithCurrentWorkspaceAndPage', () => {
  test('from "/"', async () => {
    const { ProviderWrapper, store } = await getJotaiContext();
    const mutationHook = renderHook(() => useWorkspacesHelper(), {
      wrapper: ProviderWrapper,
    });
    const id = await mutationHook.result.current.createLocalWorkspace('test0');
    await store.get(currentWorkspaceAtom);
    mutationHook.rerender();
    mutationHook.result.current.createWorkspacePage(id, 'page0');
    const routerHook = renderHook(() => useRouter());
    await routerHook.result.current.push('/');
    routerHook.rerender();
    expect(routerHook.result.current.asPath).toBe('/');
    renderHook(
      ({ router }) => useSyncRouterWithCurrentWorkspaceAndPage(router),
      {
        wrapper: ProviderWrapper,
        initialProps: {
          router: routerHook.result.current,
        },
      }
    );

    expect(routerHook.result.current.asPath).toBe(`/workspace/${id}/page0`);
  });

  test('from empty workspace', async () => {
    const { ProviderWrapper, store } = await getJotaiContext();
    const mutationHook = renderHook(() => useWorkspacesHelper(), {
      wrapper: ProviderWrapper,
    });
    const id = await mutationHook.result.current.createLocalWorkspace('test0');
    const workspaces = await store.get(workspacesAtom);
    expect(workspaces.length).toEqual(1);
    mutationHook.rerender();
    const routerHook = renderHook(() => useRouter());
    await routerHook.result.current.push(`/workspace/${id}/not_exist`);
    routerHook.rerender();
    expect(routerHook.result.current.asPath).toBe(`/workspace/${id}/not_exist`);
    renderHook(
      ({ router }) => useSyncRouterWithCurrentWorkspaceAndPage(router),
      {
        wrapper: ProviderWrapper,
        initialProps: {
          router: routerHook.result.current,
        },
      }
    );

    await new Promise(resolve => setTimeout(resolve, REDIRECT_TIMEOUT + 50));

    expect(routerHook.result.current.asPath).toBe(`/workspace/${id}/all`);
  });

  test('from incorrect "/workspace/[workspaceId]/[pageId]"', async () => {
    const { ProviderWrapper, store } = await getJotaiContext();
    const mutationHook = renderHook(() => useWorkspacesHelper(), {
      wrapper: ProviderWrapper,
    });
    const id = await mutationHook.result.current.createLocalWorkspace('test0');
    const workspaces = await store.get(workspacesAtom);
    expect(workspaces.length).toEqual(1);
    mutationHook.rerender();
    mutationHook.result.current.createWorkspacePage(id, 'page0');
    const routerHook = renderHook(() => useRouter());
    await routerHook.result.current.push(`/workspace/${id}/not_exist`);
    routerHook.rerender();
    expect(routerHook.result.current.asPath).toBe(`/workspace/${id}/not_exist`);
    renderHook(
      ({ router }) => useSyncRouterWithCurrentWorkspaceAndPage(router),
      {
        wrapper: ProviderWrapper,
        initialProps: {
          router: routerHook.result.current,
        },
      }
    );

    await new Promise(resolve => setTimeout(resolve, REDIRECT_TIMEOUT + 50));

    expect(routerHook.result.current.asPath).toBe(`/workspace/${id}/page0`);
  });
});

describe('useBlockSuiteWorkspaceName', () => {
  test('basic', async () => {
    blockSuiteWorkspace.meta.setName('test 1');
    const workspaceNameHook = renderHook(() =>
      useBlockSuiteWorkspaceName(blockSuiteWorkspace)
    );
    expect(workspaceNameHook.result.current[0]).toBe('test 1');
    blockSuiteWorkspace.meta.setName('test 2');
    workspaceNameHook.rerender();
    expect(workspaceNameHook.result.current[0]).toBe('test 2');
    workspaceNameHook.result.current[1]('test 3');
    expect(blockSuiteWorkspace.meta.name).toBe('test 3');
  });
});

describe('useRecentlyViewed', () => {
  test('basic', async () => {
    const { ProviderWrapper, store } = await getJotaiContext();
    const workspaceId = blockSuiteWorkspace.id;
    const pageId = 'page0';
    store.set(jotaiWorkspacesAtom, [
      {
        id: workspaceId,
        flavour: WorkspaceFlavour.LOCAL,
      },
    ]);
    LocalPlugin.CRUD.get = vi.fn().mockResolvedValue({
      id: workspaceId,
      flavour: WorkspaceFlavour.LOCAL,
      blockSuiteWorkspace,
      providers: [],
    } satisfies LocalWorkspace);
    store.set(currentWorkspaceIdAtom, blockSuiteWorkspace.id);
    const workspace = await store.get(currentWorkspaceAtom);
    expect(workspace?.id).toBe(blockSuiteWorkspace.id);
    const currentHook = renderHook(() => useCurrentWorkspace(), {
      wrapper: ProviderWrapper,
    });
    expect(currentHook.result.current[0]?.id).toEqual(workspaceId);
    await store.get(currentWorkspaceAtom);
    const recentlyViewedHook = renderHook(() => useRecentlyViewed(), {
      wrapper: ProviderWrapper,
    });
    expect(recentlyViewedHook.result.current).toEqual([]);
    const routerHook = renderHook(() => useRouter());
    await routerHook.result.current.push({
      pathname: '/workspace/[workspaceId]/[pageId]',
      query: {
        workspaceId,
        pageId,
      },
    });
    routerHook.rerender();
    const syncHook = renderHook(
      router => useSyncRecentViewsWithRouter(router),
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
describe('useIsFirstLoad', () => {
  test('useLastVersion', async () => {
    const lastVersion = renderHook(() => useLastVersion());
    const setLastVersion = lastVersion.result.current[1];
    expect(lastVersion.result.current[0]).toEqual('0.0.0');
    setLastVersion('testVersion');
    lastVersion.rerender();
    expect(lastVersion.result.current[0]).toEqual('testVersion');
  });
  test('useGuideHidden', async () => {
    const guideHidden = renderHook(() => useGuideHidden());
    const setGuideHidden = guideHidden.result.current[1];
    expect(guideHidden.result.current[0]).toEqual({});
    setGuideHidden({ test: true });
    guideHidden.rerender();
    expect(guideHidden.result.current[0]).toEqual({ test: true });
  });
  test('useGuideHiddenUntilNextUpdate', async () => {
    const guideHiddenUntilNextUpdate = renderHook(() =>
      useGuideHiddenUntilNextUpdate()
    );
    const setGuideHiddenUntilNextUpdate =
      guideHiddenUntilNextUpdate.result.current[1];
    expect(guideHiddenUntilNextUpdate.result.current[0]).toEqual({});
    setGuideHiddenUntilNextUpdate({ test: true });
    guideHiddenUntilNextUpdate.rerender();
    expect(guideHiddenUntilNextUpdate.result.current[0]).toEqual({
      test: true,
    });
  });
  test('useTipsDisplayStatus', async () => {
    const tipsDisplayStatus = renderHook(() => useTipsDisplayStatus());
    const setTipsDisplayStatus = tipsDisplayStatus.result.current;
    expect(tipsDisplayStatus.result.current).toEqual({
      quickSearchTips: {
        permanentlyHidden: true,
        hiddenUntilNextUpdate: true,
      },
      changeLog: {
        permanentlyHidden: true,
        hiddenUntilNextUpdate: true,
      },
    });
  });
});
