/**
 * @vitest-environment happy-dom
 */
import assert from 'node:assert';

import { __unstableSchemas, builtInSchemas } from '@blocksuite/blocks/models';
import { Page } from '@blocksuite/store';
import { render, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';

import { BlockSuiteWorkspace } from '../../shared';
import { usePageMetas } from '../use-page-metas';
import { useWorkspaces, useWorkspacesMutation } from '../use-workspaces';

let blockSuiteWorkspace: BlockSuiteWorkspace;
beforeEach(() => {
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

test('usePageMetas', async () => {
  const Component = () => {
    const pageMetas = usePageMetas(blockSuiteWorkspace);
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
    assert(firstWorkspace.flavour === 'local');
    expect(firstWorkspace.blockSuiteWorkspace.meta.name).toBe('test');
  });
});
