import { DebugLogger } from '@affine/debug';
import { WorkspaceSubPath, WorkspaceVersion } from '@affine/env/workspace';
import {
  type RootWorkspaceMetadataV2,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import { getWorkspace } from '@toeverything/plugin-infra/__internal__/workspace';
import { rootStore } from '@toeverything/plugin-infra/manager';
import { useAtomValue } from 'jotai';
import { lazy, useEffect, useRef } from 'react';

import { WorkspaceAdapters } from '../adapters/workspace';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';
import { useWorkspace } from '../hooks/use-workspace';

const AllWorkspaceModals = lazy(() =>
  import('../providers/modal-provider').then(({ AllWorkspaceModals }) => ({
    default: AllWorkspaceModals,
  }))
);

type WorkspaceLoaderProps = {
  id: string;
};

const createFirst = (): RootWorkspaceMetadataV2[] => {
  const Plugins = Object.values(WorkspaceAdapters).sort(
    (a, b) => a.loadPriority - b.loadPriority
  );

  return Plugins.flatMap(Plugin => {
    return Plugin.Events['app:init']?.().map(
      id =>
        ({
          id,
          flavour: Plugin.flavour,
          // new workspace should all support sub-doc feature
          version: WorkspaceVersion.SubDoc,
        }) satisfies RootWorkspaceMetadataV2
    );
  }).filter((ids): ids is RootWorkspaceMetadataV2 => !!ids);
};

rootStore
  .get(rootWorkspacesMetadataAtom)
  .then(meta => {
    if (meta.length === 0 && localStorage.getItem('is-first-open') === null) {
      const result = createFirst();
      console.info('create first workspace', result);
      localStorage.setItem('is-first-open', 'false');
      rootStore.set(rootWorkspacesMetadataAtom, result).catch(console.error);
    }
  })
  .catch(console.error);

const WorkspaceLoader = (props: WorkspaceLoaderProps): null => {
  useWorkspace(props.id);
  return null;
};

const logger = new DebugLogger('index-page');

export const Component = () => {
  const meta = useAtomValue(rootWorkspacesMetadataAtom);
  const navigateHelper = useNavigateHelper();
  const jumpOnceRef = useRef(false);
  useEffect(() => {
    if (jumpOnceRef.current) {
      return;
    }
    const lastId = localStorage.getItem('last_workspace_id');
    const lastPageId = localStorage.getItem('last_page_id');
    const target =
      (lastId && meta.find(({ id }) => id === lastId)) || meta.at(0);
    if (target) {
      const targetWorkspace = getWorkspace(target.id);
      const nonTrashPages = targetWorkspace.meta.pageMetas.filter(
        ({ trash }) => !trash
      );
      const pageId =
        nonTrashPages.find(({ id }) => id === lastPageId)?.id ??
        nonTrashPages.at(0)?.id;
      if (pageId) {
        logger.debug('Found target workspace. Jump to page', pageId);
        navigateHelper.jumpToPage(
          targetWorkspace.id,
          pageId,
          RouteLogic.REPLACE
        );
        jumpOnceRef.current = true;
      } else {
        const clearId = setTimeout(() => {
          dispose.dispose();
          logger.debug('Found target workspace. Jump to all pages');
          navigateHelper.jumpToSubPath(
            targetWorkspace.id,
            WorkspaceSubPath.ALL,
            RouteLogic.REPLACE
          );
          jumpOnceRef.current = true;
        }, 1000);
        const dispose = targetWorkspace.slots.pageAdded.once(pageId => {
          clearTimeout(clearId);
          navigateHelper.jumpToPage(
            targetWorkspace.id,
            pageId,
            RouteLogic.REPLACE
          );
          jumpOnceRef.current = true;
        });
        return () => {
          clearTimeout(clearId);
          dispose.dispose();
          jumpOnceRef.current = false;
        };
      }
    } else {
      console.warn('No workspace found');
    }
    return;
  }, [meta, navigateHelper]);
  return (
    <>
      {meta.map(({ id }) => (
        <WorkspaceLoader id={id} key={id} />
      ))}
      <AllWorkspaceModals />
    </>
  );
};
