import { DebugLogger } from '@affine/debug';
import {
  fetchWithTraceReport,
  type ListHistoryQuery,
  listHistoryQuery,
  recoverDocMutation,
} from '@affine/graphql';
import {
  useMutateQueryResource,
  useMutation,
  useQueryInfinite,
} from '@affine/workspace/affine/gql';
import { createAffineCloudBlobEngine } from '@affine/workspace/blob';
import { globalBlockSuiteSchema } from '@affine/workspace/manager';
import { assertEquals } from '@blocksuite/global/utils';
import { Workspace } from '@blocksuite/store';
import { usePageMetaHelper } from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspacePage } from '@toeverything/hooks/use-block-suite-workspace-page';
import { revertUpdate } from '@toeverything/y-indexeddb';
import { useMemo } from 'react';
import useSWRImmutable from 'swr/immutable';
import { applyUpdate } from 'yjs';

const logger = new DebugLogger('page-history');

type DocHistory = ListHistoryQuery['workspace']['histories'][number];

export const usePageSnapshotList = (workspaceId: string, pageDocId: string) => {
  const pageSize = 10;
  const { data, loadingMore, loadMore } = useQueryInfinite({
    query: listHistoryQuery,
    getVariables: (_, previousPageData) => {
      // use the timestamp of the last history as the cursor
      const before = previousPageData?.workspace.histories.at(-1)?.timestamp;
      const vars = {
        pageDocId: pageDocId,
        workspaceId: workspaceId,
        before: before,
        take: pageSize,
      };

      return vars;
    },
  });

  const shouldLoadMore = useMemo(() => {
    if (!data) {
      return false;
    }
    const lastPage = data.at(-1);
    if (!lastPage) {
      return false;
    }
    return lastPage.workspace.histories.length === pageSize;
  }, [data]);

  const histories = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.flatMap(page => page.workspace.histories);
  }, [data]);

  return [
    histories,
    shouldLoadMore ? loadMore : undefined,
    loadingMore,
  ] as const;
};

const snapshotFetcher = async (
  [workspaceId, pageDocId, ts]: [
    workspaceId: string,
    pageDocId: string,
    ts: string,
  ] // timestamp is the key to the history/snapshot
) => {
  if (!ts) {
    return null;
  }
  const res = await fetchWithTraceReport(
    runtimeConfig.serverUrlPrefix +
      `/api/workspaces/${workspaceId}/docs/${pageDocId}/histories/${ts}`,
    {
      priority: 'high',
    }
  );

  if (!res.ok) {
    throw new Error('Failed to fetch snapshot');
  }

  const snapshot = await res.arrayBuffer();
  if (!snapshot) {
    throw new Error('Invalid snapshot');
  }
  return snapshot;
};

// attach the Page shown in the modal to a temporary workspace
// so that we do not need to worry about providers etc
// todo: fix references to the page (the referenced page will shown as deleted)
// if we simply clone the current workspace, it maybe time consuming right?
const workspaceMap = new Map<string, Workspace>();

// assume the workspace is a cloud workspace since the history feature is only enabled for cloud workspace
const getOrCreateWorkspace = (workspaceId: string) => {
  let workspace = workspaceMap.get(workspaceId);
  if (!workspace) {
    const blobEngine = createAffineCloudBlobEngine(workspaceId);
    workspace = new Workspace({
      id: workspaceId,
      providerCreators: [],
      blobStorages: [
        () => ({
          crud: {
            async get(key) {
              return (await blobEngine.get(key)) ?? null;
            },
            async set(key, value) {
              await blobEngine.set(key, value);
              return key;
            },
            async delete(key) {
              return blobEngine.delete(key);
            },
            async list() {
              return blobEngine.list();
            },
          },
        }),
      ],
      schema: globalBlockSuiteSchema,
    });
    workspaceMap.set(workspaceId, workspace);
  }
  return workspace;
};

// workspace id + page id + timestamp -> snapshot (update binary)
export const usePageHistory = (
  workspaceId: string,
  pageDocId: string,
  ts?: string
) => {
  // snapshot should be immutable. so we use swr immutable to disable revalidation
  const { data } = useSWRImmutable<ArrayBuffer | null>(
    [workspaceId, pageDocId, ts],
    {
      fetcher: snapshotFetcher,
      suspense: false,
    }
  );
  return data ?? undefined;
};

// workspace id + page id + timestamp + snapshot -> Page (to be used for rendering in blocksuite editor)
export const useSnapshotPage = (
  workspaceId: string,
  pageDocId: string,
  ts?: string,
  snapshot?: ArrayBuffer
) => {
  const page = useMemo(() => {
    if (!ts) {
      return null;
    }
    const pageId = pageDocId + '-' + ts;
    const historyShellWorkspace = getOrCreateWorkspace(workspaceId);
    let page = historyShellWorkspace.getPage(pageId);
    if (!page && snapshot) {
      page = historyShellWorkspace.createPage({
        id: pageId,
      });
      page.awarenessStore.setReadonly(page, true);
      const spaceDoc = page.spaceDoc;
      page
        .load(() => applyUpdate(spaceDoc, new Uint8Array(snapshot)))
        .catch(console.error); // must load before applyUpdate
    }
    return page;
  }, [pageDocId, snapshot, ts, workspaceId]);

  return page;
};

export const historyListGroupByDay = (histories: DocHistory[]) => {
  const map = new Map<string, DocHistory[]>();
  for (const history of histories) {
    const day = new Date(history.timestamp).toLocaleDateString();
    const list = map.get(day) ?? [];
    list.push(history);
    map.set(day, list);
  }
  return [...map.entries()];
};

export const useRestorePage = (workspace: Workspace, pageId: string) => {
  const page = useBlockSuiteWorkspacePage(workspace, pageId);
  const mutateQueryResource = useMutateQueryResource();
  const { trigger: recover, isMutating } = useMutation({
    mutation: recoverDocMutation,
  });
  const { getPageMeta, setPageTitle } = usePageMetaHelper(workspace);

  const onRestore = useMemo(() => {
    return async (version: string, update: Uint8Array) => {
      if (!page) {
        return;
      }
      const pageDocId = page.spaceDoc.guid;
      revertUpdate(page.spaceDoc, update, key => {
        assertEquals(key, 'blocks'); // only expect this value is 'blocks'
        return 'Map';
      });

      // should also update the page title, since it may be changed in the history
      const title = page.meta.title;

      if (getPageMeta(pageDocId)?.title !== title) {
        setPageTitle(pageDocId, title);
      }

      await recover({
        docId: pageDocId,
        timestamp: version,
        workspaceId: workspace.id,
      });

      await mutateQueryResource(listHistoryQuery, vars => {
        return (
          vars.pageDocId === pageDocId && vars.workspaceId === workspace.id
        );
      });

      logger.info('Page restored', pageDocId, version);
    };
  }, [
    getPageMeta,
    mutateQueryResource,
    page,
    recover,
    setPageTitle,
    workspace.id,
  ]);

  return {
    onRestore,
    isMutating,
  };
};
