import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { useDocCollectionPage } from '@affine/core/hooks/use-block-suite-workspace-page';
import { timestampToLocalDate } from '@affine/core/utils';
import { DebugLogger } from '@affine/debug';
import {
  fetchWithTraceReport,
  type ListHistoryQuery,
  listHistoryQuery,
  recoverDocMutation,
} from '@affine/graphql';
import { AffineCloudBlobStorage } from '@affine/workspace-impl';
import { assertEquals } from '@blocksuite/global/utils';
import { DocCollection } from '@blocksuite/store';
import { globalBlockSuiteSchema } from '@toeverything/infra';
import { revertUpdate } from '@toeverything/y-indexeddb';
import { useEffect, useMemo } from 'react';
import useSWRImmutable from 'swr/immutable';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import {
  useMutateQueryResource,
  useMutation,
} from '../../../hooks/use-mutation';
import { useQueryInfinite } from '../../../hooks/use-query';

const logger = new DebugLogger('page-history');

type DocHistory = ListHistoryQuery['workspace']['histories'][number];

export const useDocSnapshotList = (workspaceId: string, pageDocId: string) => {
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

  return [histories, shouldLoadMore ? loadMore : false, !!loadingMore] as const;
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
const docCollectionMap = new Map<string, DocCollection>();

// assume the workspace is a cloud workspace since the history feature is only enabled for cloud workspace
const getOrCreateShellWorkspace = (workspaceId: string) => {
  let docCollection = docCollectionMap.get(workspaceId);
  if (!docCollection) {
    const blobStorage = new AffineCloudBlobStorage(workspaceId);
    docCollection = new DocCollection({
      id: workspaceId,
      blobStorages: [
        () => ({
          crud: blobStorage,
        }),
      ],
      schema: globalBlockSuiteSchema,
    });
    docCollectionMap.set(workspaceId, docCollection);
    docCollection.doc.emit('sync', []);
  }
  return docCollection;
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
  docCollection: DocCollection,
  pageDocId: string,
  ts?: string
) => {
  const snapshot = usePageHistory(docCollection.id, pageDocId, ts);
  const page = useMemo(() => {
    if (!ts) {
      return;
    }
    const pageId = pageDocId + '-' + ts;
    const historyShellWorkspace = getOrCreateShellWorkspace(docCollection.id);
    let page = historyShellWorkspace.getDoc(pageId);
    if (!page && snapshot) {
      page = historyShellWorkspace.createDoc({
        id: pageId,
      });
      page.awarenessStore.setReadonly(page, true);
      const spaceDoc = page.spaceDoc;
      page.load(() => {
        applyUpdate(spaceDoc, new Uint8Array(snapshot));
        historyShellWorkspace.schema.upgradeDoc(0, {}, spaceDoc);
      }); // must load before applyUpdate
    }
    return page ?? undefined;
  }, [pageDocId, snapshot, ts, docCollection]);

  useEffect(() => {
    const historyShellWorkspace = getOrCreateShellWorkspace(docCollection.id);
    // apply the rootdoc's update to the current workspace
    // this makes sure the page reference links are not deleted ones in the preview
    const update = encodeStateAsUpdate(docCollection.doc);
    applyUpdate(historyShellWorkspace.doc, update);
  }, [docCollection]);

  return page;
};

export const historyListGroupByDay = (histories: DocHistory[]) => {
  const map = new Map<string, DocHistory[]>();
  for (const history of histories) {
    const day = timestampToLocalDate(history.timestamp);
    const list = map.get(day) ?? [];
    list.push(history);
    map.set(day, list);
  }
  return [...map.entries()];
};

export const useRestorePage = (
  docCollection: DocCollection,
  pageId: string
) => {
  const page = useDocCollectionPage(docCollection, pageId);
  const mutateQueryResource = useMutateQueryResource();
  const { trigger: recover, isMutating } = useMutation({
    mutation: recoverDocMutation,
  });
  const { getDocMeta, setDocTitle } = useDocMetaHelper(docCollection);

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
      const title = page.meta?.title ?? '';

      if (getDocMeta(pageId)?.title !== title) {
        setDocTitle(pageId, title);
      }

      await recover({
        docId: pageDocId,
        timestamp: version,
        workspaceId: docCollection.id,
      });

      await mutateQueryResource(listHistoryQuery, vars => {
        return (
          vars.pageDocId === pageDocId && vars.workspaceId === docCollection.id
        );
      });

      logger.info('Page restored', pageDocId, version);
    };
  }, [
    getDocMeta,
    mutateQueryResource,
    page,
    pageId,
    recover,
    setDocTitle,
    docCollection.id,
  ]);

  return {
    onRestore,
    isMutating,
  };
};
