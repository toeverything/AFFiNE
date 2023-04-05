/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { WorkspaceFlavour } from '@affine/workspace/type';
import { assertExists } from '@blocksuite/store';
import { render, renderHook } from '@testing-library/react';
import { createStore, getDefaultStore, Provider } from 'jotai';
import { useRouter } from 'next/router';
import type React from 'react';
import { useCallback } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { workspacesAtom } from '../../atoms';
import { useCurrentPageId } from '../../hooks/current/use-current-page-id';
import {
  currentWorkspaceAtom,
  useCurrentWorkspace,
} from '../../hooks/current/use-current-workspace';
import { useBlockSuiteWorkspaceHelper } from '../../hooks/use-blocksuite-workspace-helper';
import { useWorkspacesHelper } from '../../hooks/use-workspaces';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { pathGenerator } from '../../shared';
import { WorkSpaceSliderBar } from '../pure/workspace-slider-bar';

vi.mock('../blocksuite/header/editor-mode-switch/CustomLottie', () => ({
  default: (props: React.PropsWithChildren) => <>{props.children}</>,
}));

// fetchMocker.enableMocks();
let store = getDefaultStore();
beforeEach(async () => {
  store = createStore();
  await store.get(workspacesAtom);
});

const ProviderWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {
  return <Provider store={store}>{children}</Provider>;
};

describe('WorkSpaceSliderBar', () => {
  test('basic', async () => {
    // fetchMocker.mock

    const onOpenWorkspaceListModalFn = vi.fn();
    const onOpenQuickSearchModalFn = vi.fn();
    const mutationHook = renderHook(() => useWorkspacesHelper(), {
      wrapper: ProviderWrapper,
    });
    const id = await mutationHook.result.current.createLocalWorkspace('test0');
    await store.get(workspacesAtom);
    mutationHook.rerender();
    mutationHook.result.current.createWorkspacePage(id, 'test1');
    await store.get(currentWorkspaceAtom);
    const currentWorkspaceHook = renderHook(() => useCurrentWorkspace(), {
      wrapper: ProviderWrapper,
    });
    let i = 0;
    const Component = () => {
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
          currentPath={useRouter().asPath}
          paths={pathGenerator}
          isPublicWorkspace={false}
        />
      );
    };
    const App = () => {
      return (
        <ThemeProvider>
          <ProviderWrapper>
            <Component />
          </ProviderWrapper>
        </ThemeProvider>
      );
    };
    currentWorkspaceHook.result.current[1](id);
    const currentWorkspace = await store.get(currentWorkspaceAtom);
    expect(currentWorkspace).toBeDefined();
    expect(currentWorkspace?.flavour).toBe(WorkspaceFlavour.LOCAL);
    expect(currentWorkspace?.id).toBe(id);
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
