/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import assert from 'node:assert';

import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
import { rootCurrentWorkspaceIdAtom } from '@affine/workspace/atom';
import type { PageBlockModel } from '@blocksuite/blocks';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { render, renderHook } from '@testing-library/react';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@toeverything/hooks/use-block-suite-page-meta';
import { createStore, Provider } from 'jotai';
import routerMock from 'next-router-mock';
import { createDynamicRouteParser } from 'next-router-mock/dynamic-routes';
import type React from 'react';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { workspacesAtom } from '../../atoms';
import { rootCurrentWorkspaceAtom } from '../../atoms/root';
import { BlockSuiteWorkspace } from '../../shared';
import { useCurrentWorkspace } from '../current/use-current-workspace';
import { useAppHelper, useWorkspaces } from '../use-workspaces';

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
  const initPage = async (page: Page) => {
    await page.waitForLoaded();
    expect(page).not.toBeNull();
    assertExists(page);
    const pageBlockId = page.addBlock('affine:page', {
      title: new page.Text(''),
    });
    const frameId = page.addBlock('affine:note', {}, pageBlockId);
    page.addBlock('affine:paragraph', {}, frameId);
  };
  await initPage(
    blockSuiteWorkspace.createPage({
      id: 'page0',
    })
  );
  await initPage(blockSuiteWorkspace.createPage({ id: 'page1' }));
  await initPage(blockSuiteWorkspace.createPage({ id: 'page2' }));
});

describe('usePageMetas', async () => {
  test('basic', async () => {
    const Component = () => {
      const pageMetas = useBlockSuitePageMeta(blockSuiteWorkspace);
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
      useBlockSuitePageMeta(blockSuiteWorkspace)
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
      useBlockSuitePageMeta(blockSuiteWorkspace)
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
    const workspaceHelperHook = renderHook(() => useAppHelper(), {
      wrapper: ProviderWrapper,
    });
    const id = await workspaceHelperHook.result.current.createLocalWorkspace(
      'test'
    );
    const workspaces = await store.get(workspacesAtom);
    expect(workspaces.length).toBe(2);
    expect(workspaces[1].id).toBe(id);
    const workspacesHook = renderHook(() => useWorkspaces(), {
      wrapper: ProviderWrapper,
    });
    store.set(rootCurrentWorkspaceIdAtom, workspacesHook.result.current[1].id);
    await store.get(rootCurrentWorkspaceAtom);
    const currentWorkspaceHook = renderHook(() => useCurrentWorkspace(), {
      wrapper: ProviderWrapper,
    });
    currentWorkspaceHook.result.current[1](workspacesHook.result.current[1].id);
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
    const { result } = renderHook(() => useAppHelper(), {
      wrapper: ProviderWrapper,
    });
    {
      const workspaces = await store.get(workspacesAtom);
      expect(workspaces.length).toEqual(0);
    }
    await result.current.createLocalWorkspace('test');
    {
      const workspaces = await store.get(workspacesAtom);
      expect(workspaces.length).toEqual(1);
    }
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
