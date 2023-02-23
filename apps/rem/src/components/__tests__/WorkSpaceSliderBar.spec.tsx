/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { render, renderHook } from '@testing-library/react';
import { useRouter } from 'next/router';
import { useCallback, useState } from 'react';
import { describe, expect, test, vi } from 'vitest';

import { useCurrentPageId } from '../../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { useWorkspacesHelper } from '../../hooks/use-workspaces';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { paths } from '../../shared';
import { WorkSpaceSliderBar } from '../pure/workspace-slider-bar';

describe('WorkSpaceSliderBar', () => {
  test('basic', async () => {
    const fn = vi.fn();
    const mutationHook = renderHook(() => useWorkspacesHelper());
    const id = mutationHook.result.current.createRemLocalWorkspace('test0');
    mutationHook.result.current.createWorkspacePage(id, 'test1');
    const Component = () => {
      const [show, setShow] = useState(false);
      const [currentWorkspace] = useCurrentWorkspace();
      const [currentPageId] = useCurrentPageId();
      return (
        <WorkSpaceSliderBar
          triggerQuickSearchModal={function (): void {
            throw new Error('Function not implemented.');
          }}
          currentWorkspace={currentWorkspace}
          currentPageId={currentPageId}
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
