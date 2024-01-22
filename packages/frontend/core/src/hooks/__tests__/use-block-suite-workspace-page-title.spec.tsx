/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import {
  currentWorkspaceAtom,
  WorkspacePropertiesAdapter,
} from '@affine/core/modules/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import type { Workspace } from '@affine/workspace/workspace';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { assertExists } from '@blocksuite/global/utils';
import { type Page, Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { Schema } from '@blocksuite/store';
import { render } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { Suspense } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { beforeEach } from 'vitest';

import { useBlockSuiteWorkspacePageTitle } from '../use-block-suite-workspace-page-title';

let blockSuiteWorkspace: BlockSuiteWorkspace;
const store = createStore();

const schema = new Schema();
schema.register(AffineSchemas).register(__unstableSchemas);

const Component = () => {
  const title = useBlockSuiteWorkspacePageTitle(blockSuiteWorkspace, 'page0');
  return <div>title: {title}</div>;
};

// todo: this module has some side-effects that will break the tests
vi.mock('@affine/workspace-impl', () => ({
  default: {},
}));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['requestIdleCallback'] });

  blockSuiteWorkspace = new BlockSuiteWorkspace({ id: 'test', schema });

  const workspace = {
    blockSuiteWorkspace,
    flavour: WorkspaceFlavour.LOCAL,
  } as Workspace;

  store.set(currentWorkspaceAtom, workspace);

  blockSuiteWorkspace = workspace.blockSuiteWorkspace;

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
  await initPage(blockSuiteWorkspace.createPage({ id: 'page0' }));
  await initPage(blockSuiteWorkspace.createPage({ id: 'page1' }));
  await initPage(blockSuiteWorkspace.createPage({ id: 'page2' }));
});

describe('useBlockSuiteWorkspacePageTitle', () => {
  test('basic', async () => {
    const { findByText, rerender } = render(
      <Provider store={store}>
        <Suspense fallback="loading">
          <Component />
        </Suspense>
      </Provider>
    );
    expect(await findByText('title: Untitled')).toBeDefined();
    blockSuiteWorkspace.setPageMeta('page0', { title: '1' });
    rerender(
      <Provider store={store}>
        <Suspense fallback="loading">
          <Component />
        </Suspense>
      </Provider>
    );
    expect(await findByText('title: 1')).toBeDefined();
  });

  test('journal', async () => {
    const adapter = new WorkspacePropertiesAdapter(blockSuiteWorkspace);
    adapter.setJournalPageDateString('page0', '2021-01-01');
    const { findByText } = render(
      <Provider store={store}>
        <Suspense fallback="loading">
          <Component />
        </Suspense>
      </Provider>
    );
    expect(await findByText('title: Jan 1, 2021')).toBeDefined();
  });
});
