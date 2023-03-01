/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { assertExists } from '@blocksuite/store';
import { render, renderHook } from '@testing-library/react';
import { useRouter } from 'next/router';
import { useCallback, useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import createFetchMock from 'vitest-fetch-mock';

import { useCurrentPageId } from '../../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { useBlockSuiteWorkspaceHelper } from '../../hooks/use-blocksuite-workspace-helper';
import { useWorkspacesHelper } from '../../hooks/use-workspaces';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { pathGenerator } from '../../shared';
import { WorkSpaceSliderBar } from '../pure/workspace-slider-bar';

const fetchMocker = createFetchMock(vi);

// fetchMocker.enableMocks();

describe('WorkSpaceSliderBar', () => {
  test('basic', async () => {
    // fetchMocker.mock

    const onOpenWorkspaceListModalFn = vi.fn();
    const onOpenQuickSearchModalFn = vi.fn();
    const mutationHook = renderHook(() => useWorkspacesHelper());
    const id = mutationHook.result.current.createRemLocalWorkspace('test0');
    mutationHook.result.current.createWorkspacePage(id, 'test1');
    const currentWorkspaceHook = renderHook(() => useCurrentWorkspace());
    let i = 0;
    const Component = () => {
      const [show, setShow] = useState(false);
      const [currentWorkspace] = useCurrentWorkspace();
      const [currentPageId] = useCurrentPageId();
      assertExists(currentWorkspace);
      const helper = useBlockSuiteWorkspaceHelper(
        currentWorkspace.blockSuiteWorkspace
      );
      return (
        <WorkSpaceSliderBar
          currentWorkspace={currentWorkspace}
          currentPageId={currentPageId}
          onOpenQuickSearchModal={onOpenQuickSearchModalFn}
          onOpenWorkspaceListModal={onOpenWorkspaceListModalFn}
          openPage={useCallback(() => {}, [])}
          createPage={() => {
            i++;
            return helper.createPage('page-test-' + i);
          }}
          show={show}
          setShow={setShow}
          currentPath={useRouter().asPath}
          paths={pathGenerator}
          isPublicWorkspace={false}
        />
      );
    };
    const App = () => {
      return (
        <ThemeProvider>
          <Component />
        </ThemeProvider>
      );
    };
    currentWorkspaceHook.result.current[1](id);
    const app = render(<App />);
    const card = await app.findByTestId('current-workspace');
    expect(onOpenWorkspaceListModalFn).toBeCalledTimes(0);
    card.click();
    expect(onOpenWorkspaceListModalFn).toBeCalledTimes(1);
    const newPageButton = await app.findByTestId('new-page-button');
    newPageButton.click();
    expect(
      currentWorkspaceHook.result.current[0]?.blockSuiteWorkspace.meta
        .pageMetas[1].id
    ).toBe('page-test-1');
    expect(onOpenQuickSearchModalFn).toBeCalledTimes(0);
    const quickSearchButton = await app.findByTestId(
      'slider-bar-quick-search-button'
    );
    quickSearchButton.click();
    expect(onOpenQuickSearchModalFn).toBeCalledTimes(1);
  });
});
