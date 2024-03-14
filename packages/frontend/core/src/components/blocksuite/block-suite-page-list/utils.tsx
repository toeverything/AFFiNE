import { toast } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { useDocCollectionHelper } from '@affine/core/hooks/use-block-suite-workspace-helper';
import { WorkspaceSubPath } from '@affine/core/shared';
import { useService } from '@toeverything/infra';
import { PageRecordList } from '@toeverything/infra';
import { initEmptyPage } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import type { DocCollection } from '../../../shared';

export const usePageHelper = (docCollection: DocCollection) => {
  const { openPage, jumpToSubPath } = useNavigateHelper();
  const { createDoc } = useDocCollectionHelper(docCollection);
  const { setDocMeta } = useDocMetaHelper(docCollection);
  const pageRecordList = useService(PageRecordList);

  const isPreferredEdgeless = useCallback(
    (pageId: string) =>
      pageRecordList.record(pageId).value?.mode.value === 'edgeless',
    [pageRecordList]
  );

  const createPageAndOpen = useCallback(
    (mode?: 'page' | 'edgeless') => {
      const page = createDoc();
      initEmptyPage(page);
      pageRecordList.record(page.id).value?.setMode(mode || 'page');
      openPage(docCollection.id, page.id);
      return page;
    },
    [docCollection.id, createDoc, openPage, pageRecordList]
  );

  const createEdgelessAndOpen = useCallback(() => {
    return createPageAndOpen('edgeless');
  }, [createPageAndOpen]);

  const importFileAndOpen = useAsyncCallback(async () => {
    const { showImportModal } = await import('@blocksuite/blocks');
    const onSuccess = (
      pageIds: string[],
      options: { isWorkspaceFile: boolean; importedCount: number }
    ) => {
      toast(
        `Successfully imported ${options.importedCount} Page${
          options.importedCount > 1 ? 's' : ''
        }.`
      );
      if (options.isWorkspaceFile) {
        jumpToSubPath(docCollection.id, WorkspaceSubPath.ALL);
        return;
      }

      if (pageIds.length === 0) {
        return;
      }
      const pageId = pageIds[0];
      openPage(docCollection.id, pageId);
    };
    showImportModal({ collection: docCollection, onSuccess });
  }, [docCollection, openPage, jumpToSubPath]);

  const createLinkedPageAndOpen = useAsyncCallback(
    async (pageId: string) => {
      const page = createPageAndOpen();
      page.load();
      const parentPage = docCollection.getDoc(pageId);
      if (parentPage) {
        parentPage.load();
        const text = parentPage.Text.fromDelta([
          {
            insert: ' ',
            attributes: {
              reference: {
                type: 'LinkedPage',
                pageId: page.id,
              },
            },
          },
        ]);
        const [frame] = parentPage.getBlockByFlavour('affine:note');
        frame && parentPage.addBlock('affine:paragraph', { text }, frame.id);
        setDocMeta(page.id, {});
      }
    },
    [docCollection, createPageAndOpen, setDocMeta]
  );

  return useMemo(() => {
    return {
      isPreferredEdgeless,
      createPage: createPageAndOpen,
      createEdgeless: createEdgelessAndOpen,
      importFile: importFileAndOpen,
      createLinkedPage: createLinkedPageAndOpen,
    };
  }, [
    isPreferredEdgeless,
    createEdgelessAndOpen,
    createLinkedPageAndOpen,
    createPageAndOpen,
    importFileAndOpen,
  ]);
};
