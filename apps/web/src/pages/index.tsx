import { WorkspaceFallback } from '@affine/component/workspace';
import { DebugLogger } from '@affine/debug';
import { WorkspaceSubPath, WorkspaceVersion } from '@affine/env/workspace';
import type { RootWorkspaceMetadataV2 } from '@affine/workspace/atom';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { getWorkspace } from '@toeverything/plugin-infra/__internal__/workspace';
import { useAtom } from 'jotai';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { Suspense, useEffect } from 'react';

import { WorkspaceAdapters } from '../adapters/workspace';
import { RouteLogic, useRouterHelper } from '../hooks/use-router-helper';
import { useWorkspace } from '../hooks/use-workspace';
import { useAppHelper } from '../hooks/use-workspaces';
import { AllWorkspaceModals } from '../providers/modal-provider';

const logger = new DebugLogger('index:router');

type AllWorkspaceLoaderProps = {
  id: string;
};

const WorkspaceLoader = (props: AllWorkspaceLoaderProps): null => {
  useWorkspace(props.id);
  return null;
};

const IndexPageInner = () => {
  const router = useRouter();
  const { jumpToPage, jumpToSubPath } = useRouterHelper(router);
  const [meta, setMeta] = useAtom(rootWorkspacesMetadataAtom);
  const helper = useAppHelper();

  useEffect(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;
    const createFirst = (): RootWorkspaceMetadataV2[] => {
      if (signal.aborted) {
        return [];
      }

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

    if (meta.length === 0 && localStorage.getItem('is-first-open') === null) {
      meta.push(...createFirst());
      console.info('create first workspace', meta);
      localStorage.setItem('is-first-open', 'false');
      setMeta(meta).catch(console.error);
    }

    return () => {
      abortController.abort();
    };
  }, [meta, setMeta]);

  useEffect(() => {
    if (!router.isReady) {
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
        jumpToPage(targetWorkspace.id, pageId, RouteLogic.REPLACE).catch(
          err => {
            console.error(err);
          }
        );
      } else {
        const clearId = setTimeout(() => {
          dispose.dispose();
          logger.debug('Found target workspace. Jump to all pages');
          jumpToSubPath(
            targetWorkspace.id,
            WorkspaceSubPath.ALL,
            RouteLogic.REPLACE
          ).catch(err => {
            console.error(err);
          });
        }, 1000);
        const dispose = targetWorkspace.slots.pageAdded.once(pageId => {
          clearTimeout(clearId);
          jumpToPage(targetWorkspace.id, pageId, RouteLogic.REPLACE).catch(
            err => {
              console.error(err);
            }
          );
        });
        return () => {
          clearTimeout(clearId);
          dispose.dispose();
        };
      }
    } else {
      console.warn('No workspace found');
    }
    return;
  }, [meta, helper, jumpToPage, jumpToSubPath, router]);

  return (
    <>
      {meta.map(({ id }) => (
        <WorkspaceLoader key={id} id={id} />
      ))}
      <AllWorkspaceModals />
    </>
  );
};

const IndexPage: NextPage = () => {
  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <IndexPageInner />
    </Suspense>
  );
};

export default IndexPage;
