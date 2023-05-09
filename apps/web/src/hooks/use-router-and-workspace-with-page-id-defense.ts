import { DebugLogger } from '@affine/debug';
import { rootCurrentPageIdAtom } from '@affine/workspace/atom';
import { useAtom, useAtomValue } from 'jotai';
import type { NextRouter } from 'next/router';
import { useEffect, useRef } from 'react';

import { rootCurrentWorkspaceAtom } from '../atoms/root';
export const HALT_PROBLEM_TIMEOUT = 1000;

const logger = new DebugLogger('useRouterWithWorkspaceIdDefense');

export function useRouterAndWorkspaceWithPageIdDefense(router: NextRouter) {
  const currentWorkspace = useAtomValue(rootCurrentWorkspaceAtom);
  const [currentPageId, setCurrentPageId] = useAtom(rootCurrentPageIdAtom);
  const fallbackModeRef = useRef(false);
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const { workspaceId, pageId } = router.query;
    if (typeof pageId !== 'string') {
      logger.warn('pageId is not a string', pageId);
      return;
    }
    if (typeof workspaceId !== 'string') {
      logger.warn('workspaceId is not a string', workspaceId);
      return;
    }
    if (currentWorkspace?.id !== workspaceId) {
      logger.warn('workspaceId is not currentWorkspace', workspaceId);
      return;
    }
    if (currentPageId !== pageId && !fallbackModeRef.current) {
      logger.info('set pageId', pageId, 'for workspace', workspaceId);
      setCurrentPageId(pageId);
      void router.push({
        pathname: '/workspace/[workspaceId]/[pageId]',
        query: {
          ...router.query,
          workspaceId,
          pageId,
        },
      });
    }
  }, [currentPageId, currentWorkspace.id, router, setCurrentPageId]);
  useEffect(() => {
    if (fallbackModeRef.current) {
      return;
    }
    const id = setTimeout(() => {
      if (currentPageId) {
        const page =
          currentWorkspace.blockSuiteWorkspace.getPage(currentPageId);
        if (!page) {
          const firstOne =
            currentWorkspace.blockSuiteWorkspace.meta.pageMetas.at(0);
          if (firstOne) {
            logger.warn(
              'cannot find page',
              currentPageId,
              'so redirect to',
              firstOne.id
            );
            setCurrentPageId(firstOne.id);
            void router.push({
              pathname: '/workspace/[workspaceId]/[pageId]',
              query: {
                ...router.query,
                workspaceId: currentWorkspace.id,
                pageId: firstOne.id,
              },
            });
            fallbackModeRef.current = true;
          }
        }
      }
    }, HALT_PROBLEM_TIMEOUT);
    return () => {
      clearTimeout(id);
    };
  }, [
    currentPageId,
    currentWorkspace.blockSuiteWorkspace,
    currentWorkspace.id,
    router,
    setCurrentPageId,
  ]);
}
