/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Schema, Workspace } from '@blocksuite/store';
import { renderHook } from '@testing-library/react';
import { initEmptyPage } from '@toeverything/infra/blocksuite';
import { beforeEach, describe, expect, test } from 'vitest';

import { useBlockSuitePageMeta } from '../use-block-suite-page-meta';
import { useBlockSuiteWorkspaceHelper } from '../use-block-suite-workspace-helper';

let blockSuiteWorkspace: Workspace;

const schema = new Schema();
schema.register(AffineSchemas).register(__unstableSchemas);

beforeEach(async () => {
  blockSuiteWorkspace = new Workspace({
    id: 'test',
    schema,
  });
  await initEmptyPage(blockSuiteWorkspace.createPage({ id: 'page0' }));
  await initEmptyPage(blockSuiteWorkspace.createPage({ id: 'page1' }));
  await initEmptyPage(blockSuiteWorkspace.createPage({ id: 'page2' }));
});

describe('useBlockSuiteWorkspaceHelper', () => {
  test('should create page', () => {
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(3);
    const helperHook = renderHook(() =>
      useBlockSuiteWorkspaceHelper(blockSuiteWorkspace)
    );
    const pageMetaHook = renderHook(() =>
      useBlockSuitePageMeta(blockSuiteWorkspace)
    );
    expect(pageMetaHook.result.current.length).toBe(3);
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(3);
    const page = helperHook.result.current.createPage('page4');
    expect(page.id).toBe('page4');
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(4);
    pageMetaHook.rerender();
    expect(pageMetaHook.result.current.length).toBe(4);
  });
});
