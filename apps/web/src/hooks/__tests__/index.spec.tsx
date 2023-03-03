/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import assert from 'node:assert';

import { __unstableSchemas, builtInSchemas } from '@blocksuite/blocks/models';
import { assertExists } from '@blocksuite/store';
import { render, renderHook } from '@testing-library/react';
import { useRouter } from 'next/router';
import routerMock from 'next-router-mock';
import { createDynamicRouteParser } from 'next-router-mock/dynamic-routes';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { BlockSuiteWorkspace, RemWorkspaceFlavour } from '../../shared';
import { useCurrentWorkspace } from '../current/use-current-workspace';
import { useBlockSuiteWorkspaceName } from '../use-blocksuite-workspace-name';
import { useLastOpenedWorkspace } from '../use-last-opened-workspace';
import { usePageMeta, usePageMetaHelper } from '../use-page-meta';
import { useSyncRouterWithCurrentWorkspaceAndPage } from '../use-sync-router-with-current-workspace-and-page';
import {
  useWorkspaces,
  useWorkspacesHelper,
  vitestRefreshWorkspaces,
} from '../use-workspaces';

let blockSuiteWorkspace: BlockSuiteWorkspace;
beforeAll(() => {
  routerMock.useParser(
    createDynamicRouteParser(['/workspace/[workspaceId]/[pageId]'])
  );
});

beforeEach(async () => {
  vitestRefreshWorkspaces();
  dataCenter.isLoaded = true;
  return new Promise<void>(resolve => {
    blockSuiteWorkspace = new BlockSuiteWorkspace({
      room: 'test',
    })
      .register(builtInSchemas)
      .register(__unstableSchemas);
    blockSuiteWorkspace.slots.pageAdded.on(pageId => {
      setTimeout(() => {
        const page = blockSuiteWorkspace.getPage(pageId);
        expect(page).not.toBeNull();
        assertExists(page);
        const pageBlockId = page.addBlockByFlavour('affine:page', {
          title: new page.Text(''),
        });
        const frameId = page.addBlockByFlavour('affine:frame', {}, pageBlockId);
        page.addBlockByFlavour('affine:paragraph', {}, frameId);
        if (pageId === 'page2') {
          resolve();
        }
      });
    });
    blockSuiteWorkspace.createPage('page0');
    blockSuiteWorkspace.createPage('page1');
    blockSuiteWorkspace.createPage('page2');
  });
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
});

describe('useWorkspaces', () => {
  test('basic', () => {
    const { result } = renderHook(() => useWorkspaces());
    expect(result.current).toEqual([]);
  });

  test('mutation', () => {
    const { result } = renderHook(() => useWorkspacesHelper());
    result.current.createRemLocalWorkspace('test');
    const { result: result2 } = renderHook(() => useWorkspaces());
    expect(result2.current.length).toEqual(1);
    const firstWorkspace = result2.current[0];
    expect(firstWorkspace.flavour).toBe('local');
    assert(firstWorkspace.flavour === RemWorkspaceFlavour.LOCAL);
    expect(firstWorkspace.blockSuiteWorkspace.meta.name).toBe('test');
  });
});

describe('useSyncRouterWithCurrentWorkspaceAndPage', () => {
  test('from "/"', async () => {
    const mutationHook = renderHook(() => useWorkspacesHelper());
    const id = mutationHook.result.current.createRemLocalWorkspace('test0');
    mutationHook.result.current.createWorkspacePage(id, 'page0');
    const routerHook = renderHook(() => useRouter());
    await routerHook.result.current.push('/');
    routerHook.rerender();
    expect(routerHook.result.current.asPath).toBe('/');
    renderHook(
      ({ router }) => useSyncRouterWithCurrentWorkspaceAndPage(router),
      {
        initialProps: {
          router: routerHook.result.current,
        },
      }
    );

    expect(routerHook.result.current.asPath).toBe(`/workspace/${id}/page0`);
  });

  test('from incorrect "/workspace/[workspaceId]/[pageId]"', async () => {
    const mutationHook = renderHook(() => useWorkspacesHelper());
    const id = mutationHook.result.current.createRemLocalWorkspace('test0');
    mutationHook.result.current.createWorkspacePage(id, 'page0');
    const routerHook = renderHook(() => useRouter());
    await routerHook.result.current.push(`/workspace/${id}/not_exist`);
    routerHook.rerender();
    expect(routerHook.result.current.asPath).toBe(`/workspace/${id}/not_exist`);
    renderHook(
      ({ router }) => useSyncRouterWithCurrentWorkspaceAndPage(router),
      {
        initialProps: {
          router: routerHook.result.current,
        },
      }
    );

    expect(routerHook.result.current.asPath).toBe(`/workspace/${id}/page0`);
  });
});

describe('useLastOpenedWorkspace', () => {
  test('basic', async () => {
    const workspaceHelperHook = renderHook(() => useWorkspacesHelper());
    workspaceHelperHook.result.current.createRemLocalWorkspace('test');
    const workspacesHook = renderHook(() => useWorkspaces());
    const currentWorkspaceHook = renderHook(() => useCurrentWorkspace());
    currentWorkspaceHook.result.current[1](workspacesHook.result.current[0].id);
    const lastOpenedWorkspace = renderHook(() => useLastOpenedWorkspace());
    expect(lastOpenedWorkspace.result.current[0]).toBe(null);
    const lastOpenedWorkspace2 = renderHook(() => useLastOpenedWorkspace());
    expect(lastOpenedWorkspace2.result.current[0]).toBe(
      workspacesHook.result.current[0].id
    );
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
