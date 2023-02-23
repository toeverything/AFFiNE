/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import assert from 'node:assert';

import { __unstableSchemas, builtInSchemas } from '@blocksuite/blocks/models';
import { Page } from '@blocksuite/store';
import { render, renderHook } from '@testing-library/react';
import { useRouter } from 'next/router';
import { beforeEach, describe, expect, test } from 'vitest';

import { BlockSuiteWorkspace, RemWorkspaceFlavour } from '../../shared';
import { usePageMeta, usePageMetaMutation } from '../use-page-meta';
import { useSyncRouterWithCurrentWorkspace } from '../use-sync-router-with-current-workspace';
import {
  useWorkspaces,
  useWorkspacesMutation,
  vitestRefreshWorkspaces,
} from '../use-workspaces';

let blockSuiteWorkspace: BlockSuiteWorkspace;
beforeEach(() => {
  vitestRefreshWorkspaces();
  blockSuiteWorkspace = new BlockSuiteWorkspace({
    room: 'test',
  })
    .register(builtInSchemas)
    .register(__unstableSchemas);
  blockSuiteWorkspace.signals.pageAdded.on(pageId => {
    const page = blockSuiteWorkspace.getPage(pageId) as Page;
    const pageBlockId = page.addBlockByFlavour('affine:page', { title: '' });
    const frameId = page.addBlockByFlavour('affine:frame', {}, pageBlockId);
    page.addBlockByFlavour('affine:paragraph', {}, frameId);
  });
  blockSuiteWorkspace.createPage('page0');
  blockSuiteWorkspace.createPage('page1');
  blockSuiteWorkspace.createPage('page2');
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
      usePageMetaMutation(blockSuiteWorkspace)
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
    const { result } = renderHook(() => useWorkspacesMutation());
    result.current.createRemLocalWorkspace('test');
    const { result: result2 } = renderHook(() => useWorkspaces());
    expect(result2.current.length).toEqual(1);
    const firstWorkspace = result2.current[0];
    expect(firstWorkspace.flavour).toBe('local');
    assert(firstWorkspace.flavour === RemWorkspaceFlavour.LOCAL);
    expect(firstWorkspace.blockSuiteWorkspace.meta.name).toBe('test');
  });
});

describe('useSyncRouterWithCurrentWorkspace', () => {
  test('basic', async () => {
    const mutationHook = renderHook(() => useWorkspacesMutation());
    const id = mutationHook.result.current.createRemLocalWorkspace('test0');
    mutationHook.result.current.createWorkspacePage(id, 'page0');
    const routerHook = renderHook(() => useRouter());
    await routerHook.result.current.push('/');
    routerHook.rerender();
    expect(routerHook.result.current.asPath).toBe('/');
    renderHook(({ router }) => useSyncRouterWithCurrentWorkspace(router), {
      initialProps: {
        router: routerHook.result.current,
      },
    });

    expect(routerHook.result.current.asPath).toBe(`/workspace/${id}/page0`);
  });
});
