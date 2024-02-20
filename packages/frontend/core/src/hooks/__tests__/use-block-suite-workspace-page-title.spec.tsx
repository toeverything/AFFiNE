/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { WorkspacePropertiesAdapter } from '@affine/core/modules/workspace';
import { render } from '@testing-library/react';
import { Workspace } from '@toeverything/infra';
import { ServiceProviderContext, useService } from '@toeverything/infra/di';
import { createStore, Provider } from 'jotai';
import { Suspense } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { beforeEach } from 'vitest';

import { configureTestingEnvironment } from '../../testing';
import { useBlockSuiteWorkspacePageTitle } from '../use-block-suite-workspace-page-title';

const store = createStore();

const Component = () => {
  const workspace = useService(Workspace);
  const title = useBlockSuiteWorkspacePageTitle(
    workspace.blockSuiteWorkspace,
    'page0'
  );
  return <div>title: {title}</div>;
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['requestIdleCallback'] });
});

describe('useBlockSuiteWorkspacePageTitle', () => {
  test('basic', async () => {
    const { workspace, page } = await configureTestingEnvironment();
    const { findByText, rerender } = render(
      <ServiceProviderContext.Provider value={page.services}>
        <Provider store={store}>
          <Suspense fallback="loading">
            <Component />
          </Suspense>
        </Provider>
      </ServiceProviderContext.Provider>
    );
    expect(await findByText('title: Untitled')).toBeDefined();
    workspace.blockSuiteWorkspace.setPageMeta(page.id, { title: '1' });
    rerender(
      <ServiceProviderContext.Provider value={page.services}>
        <Provider store={store}>
          <Suspense fallback="loading">
            <Component />
          </Suspense>
        </Provider>
      </ServiceProviderContext.Provider>
    );
    expect(await findByText('title: 1')).toBeDefined();
  });

  test('journal', async () => {
    const { workspace, page } = await configureTestingEnvironment();
    const adapter = workspace.services.get(WorkspacePropertiesAdapter);
    adapter.setJournalPageDateString(page.id, '2021-01-01');
    const { findByText } = render(
      <ServiceProviderContext.Provider value={page.services}>
        <Provider store={store}>
          <Suspense fallback="loading">
            <Component />
          </Suspense>
        </Provider>
      </ServiceProviderContext.Provider>
    );
    expect(await findByText('title: Jan 1, 2021')).toBeDefined();
  });
});
