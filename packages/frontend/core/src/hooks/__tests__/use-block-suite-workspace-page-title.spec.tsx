/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { WorkspacePropertiesAdapter } from '@affine/core/modules/properties';
import { createI18n } from '@affine/i18n';
import { render } from '@testing-library/react';
import {
  FrameworkRoot,
  FrameworkScope,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { createStore, Provider } from 'jotai';
import { Suspense } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { configureTestingEnvironment } from '../../testing';
import { useDocCollectionPageTitle } from '../use-block-suite-workspace-page-title';

const store = createStore();

const Component = () => {
  const workspaceService = useService(WorkspaceService);
  const title = useDocCollectionPageTitle(
    workspaceService.workspace.docCollection,
    'page0'
  );
  return <div>title: {title}</div>;
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['requestIdleCallback'] });
});

describe('useDocCollectionPageTitle', () => {
  test('basic', async () => {
    createI18n();
    const { framework, workspace, doc } = await configureTestingEnvironment();
    const { findByText, rerender } = render(
      <FrameworkRoot framework={framework}>
        <FrameworkScope scope={workspace.scope}>
          <FrameworkScope scope={doc.scope}>
            <Provider store={store}>
              <Suspense fallback="loading">
                <Component />
              </Suspense>
            </Provider>
          </FrameworkScope>
        </FrameworkScope>
      </FrameworkRoot>
    );
    expect(await findByText('title: Untitled')).toBeDefined();
    workspace.docCollection.setDocMeta(doc.id, { title: '1' });
    rerender(
      <FrameworkRoot framework={framework}>
        <FrameworkScope scope={workspace.scope}>
          <FrameworkScope scope={doc.scope}>
            <Provider store={store}>
              <Suspense fallback="loading">
                <Component />
              </Suspense>
            </Provider>
          </FrameworkScope>
        </FrameworkScope>
      </FrameworkRoot>
    );
    expect(await findByText('title: 1')).toBeDefined();
  });

  test('journal', async () => {
    const { framework, workspace, doc } = await configureTestingEnvironment();
    const adapter = workspace.scope.get(WorkspacePropertiesAdapter);
    adapter.setJournalPageDateString(doc.id, '2021-01-01');
    const { findByText } = render(
      <FrameworkRoot framework={framework}>
        <FrameworkScope scope={workspace.scope}>
          <FrameworkScope scope={doc.scope}>
            <Provider store={store}>
              <Suspense fallback="loading">
                <Component />
              </Suspense>
            </Provider>
          </FrameworkScope>
        </FrameworkScope>
      </FrameworkRoot>
    );
    expect(await findByText('title: Jan 1, 2021')).toBeDefined();
  });
});
