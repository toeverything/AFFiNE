/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { Schema, Workspace } from '@blocksuite/store';
import { renderHook } from '@testing-library/react';
import { initEmptyPage } from '@toeverything/infra/blocksuite';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useBlockSuitePageMeta } from '../use-block-suite-page-meta';
import { useBlockSuiteWorkspaceHelper } from '../use-block-suite-workspace-helper';

let blockSuiteWorkspace: Workspace;

const schema = new Schema();
schema.register(AffineSchemas).register(__unstableSchemas);

// todo: this module has some side-effects that will break the tests
vi.mock('@affine/workspace-impl', () => ({
  default: {},
}));

beforeEach(async () => {
  blockSuiteWorkspace = new Workspace({
    id: 'test',
    schema,
  });

  blockSuiteWorkspace.doc.emit('sync', []);

  initEmptyPage(blockSuiteWorkspace.createPage({ id: 'page0' }));
  initEmptyPage(blockSuiteWorkspace.createPage({ id: 'page1' }));
  initEmptyPage(blockSuiteWorkspace.createPage({ id: 'page2' }));
});

describe('useBlockSuiteWorkspaceHelper', () => {
  test('should create page', async () => {
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(3);
    const helperHook = renderHook(() =>
      useBlockSuiteWorkspaceHelper(blockSuiteWorkspace)
    );
    const pageMetaHook = renderHook(() =>
      useBlockSuitePageMeta(blockSuiteWorkspace)
    );
    await new Promise(resolve => setTimeout(resolve));
    expect(pageMetaHook.result.current.length).toBe(3);
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(3);
    const page = helperHook.result.current.createPage('page4');
    expect(page.id).toBe('page4');
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(4);
    pageMetaHook.rerender();
    expect(pageMetaHook.result.current.length).toBe(4);
  });
});
