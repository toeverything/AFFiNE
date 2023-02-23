/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { render, renderHook } from '@testing-library/react';
import { useRouter } from 'next/router';
import { useCallback, useState } from 'react';
import { describe, expect, test, vi } from 'vitest';

import { useCurrentPage } from '../../hooks/current/use-current-page';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { useWorkspacesMutation } from '../../hooks/use-workspaces';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { WorkSpaceSliderBar } from '../pure/workspace-slider-bar';

const paths = {
  all: workspaceId => (workspaceId ? `/workspace/${workspaceId}/all` : ''),
  favorite: workspaceId =>
    workspaceId ? `/workspace/${workspaceId}/favorite` : '',
  trash: workspaceId => (workspaceId ? `/workspace/${workspaceId}/trash` : ''),
  setting: workspaceId =>
    workspaceId ? `/workspace/${workspaceId}/setting` : '',
} satisfies {
  all: (workspaceId: string | null) => string;
  favorite: (workspaceId: string | null) => string;
  trash: (workspaceId: string | null) => string;
  setting: (workspaceId: string | null) => string;
};

describe('WorkSpaceSliderBar', () => {
  test('basic', async () => {
    const fn = vi.fn();
    const mutationHook = renderHook(() => useWorkspacesMutation());
    const id = mutationHook.result.current.createRemLocalWorkspace('test0');
    mutationHook.result.current.createWorkspacePage(id, 'test1');
    const Component = () => {
      const [show, setShow] = useState(false);
      const [currentWorkspace] = useCurrentWorkspace();
      const [currentPage] = useCurrentPage();
      return (
        <WorkSpaceSliderBar
          triggerQuickSearchModal={function (): void {
            throw new Error('Function not implemented.');
          }}
          currentWorkspace={currentWorkspace}
          currentPageId={currentPage?.id ?? null}
          onClickWorkspaceListModal={fn}
          openPage={useCallback(() => {}, [])}
          createPage={useCallback(async () => null, [])}
          show={show}
          setShow={setShow}
          currentPath={useRouter().asPath}
          paths={paths}
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
    const app = render(<App />);
    const card = await app.findByTestId('current-workspace');
    card.click();
    expect(fn).toBeCalledTimes(1);
  });
});
