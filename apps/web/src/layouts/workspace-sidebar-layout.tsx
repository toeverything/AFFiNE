import { assertExists, nanoid } from '@blocksuite/store';
import { NoSsr } from '@mui/material';
import { clsx } from 'clsx';
import { useAtom } from 'jotai/index';
import { useRouter } from 'next/router';
import type { ReactElement } from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { openQuickSearchModalAtom, openWorkspacesModalAtom } from '../atoms';
import { WorkSpaceSliderBar } from '../components/pure/workspace-slider-bar';
import { useCurrentPage } from '../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useBlockSuiteWorkspaceHelper } from '../hooks/use-blocksuite-workspace-helper';
import { useRouterHelper } from '../hooks/use-router-helper';
import {
  useSidebarFloating,
  useSidebarResizing,
  useSidebarStatus,
  useSidebarWidth,
} from '../hooks/use-sidebar-status';
import { pathGenerator } from '../shared';
import {
  StyledSliderResizer,
  StyledSliderResizerInner,
  StyledSpacer,
} from './styles';
import { floatingStyle, resizingStyle } from './styles.css';

export const WorkspaceSidebarLayout = (): ReactElement => {
  const [currentWorkspace] = useCurrentWorkspace();
  const currentPage = useCurrentPage();
  const currentPageId = currentPage?.id ?? null;
  const router = useRouter();
  const { openPage } = useRouterHelper(router);
  const [, setOpenWorkspacesModal] = useAtom(openWorkspacesModalAtom);
  const helper = useBlockSuiteWorkspaceHelper(
    currentWorkspace?.blockSuiteWorkspace ?? null
  );
  const handleCreatePage = useCallback(() => {
    return helper.createPage(nanoid());
  }, [helper]);
  const handleOpenWorkspaceListModal = useCallback(() => {
    setOpenWorkspacesModal(true);
  }, [setOpenWorkspacesModal]);

  const [, setOpenQuickSearchModalAtom] = useAtom(openQuickSearchModalAtom);
  const handleOpenQuickSearchModal = useCallback(() => {
    setOpenQuickSearchModalAtom(true);
  }, [setOpenQuickSearchModalAtom]);
  const [, setIsResizing] = useSidebarResizing();
  const [sidebarOpen, setSidebarOpen] = useSidebarStatus();
  const sidebarFloating = useSidebarFloating();
  const [sidebarWidth, setSliderWidth] = useSidebarWidth();
  const [actualSidebarWidth, setActualSidebarWidth] = useState<string | number>(
    256
  );
  useEffect(() => {
    setActualSidebarWidth(
      !sidebarOpen ? 0 : sidebarFloating ? 'calc(10vw + 400px)' : sidebarWidth
    );
  }, [sidebarFloating, sidebarOpen, sidebarWidth]);

  const [resizing] = useSidebarResizing();

  const onResizeStart = useCallback(() => {
    let resized = false;
    function onMouseMove(e: MouseEvent) {
      const newWidth = Math.min(480, Math.max(e.clientX, 256));
      setSliderWidth(newWidth);
      setIsResizing(true);
      resized = true;
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener(
      'mouseup',
      () => {
        // if not resized, toggle sidebar
        if (!resized) {
          setSidebarOpen(o => !o);
        }
        setIsResizing(false);
        document.removeEventListener('mousemove', onMouseMove);
      },
      { once: true }
    );
  }, [setIsResizing, setSidebarOpen, setSliderWidth]);

  const spacerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (spacerRef.current) {
      spacerRef.current.style.width = `${actualSidebarWidth}px`;
    }
  }, [actualSidebarWidth]);
  return (
    <NoSsr>
      <WorkSpaceSliderBar
        onOpenQuickSearchModal={handleOpenQuickSearchModal}
        currentWorkspace={currentWorkspace}
        currentPageId={currentPageId}
        onOpenWorkspaceListModal={handleOpenWorkspaceListModal}
        openPage={useCallback(
          (pageId: string) => {
            assertExists(currentWorkspace);
            return openPage(currentWorkspace.id, pageId);
          },
          [currentWorkspace, openPage]
        )}
        createPage={handleCreatePage}
        currentPath={router.asPath.split('?')[0]}
        paths={pathGenerator}
      />
      <StyledSpacer
        className={clsx({
          [floatingStyle]: sidebarFloating,
          [resizingStyle]: resizing,
        })}
        ref={spacerRef}
      >
        {!sidebarFloating && sidebarOpen && (
          <StyledSliderResizer
            data-testid="sliderBar-resizer"
            isResizing={resizing}
            onMouseDown={onResizeStart}
          >
            <StyledSliderResizerInner isResizing={resizing} />
          </StyledSliderResizer>
        )}
      </StyledSpacer>
    </NoSsr>
  );
};
