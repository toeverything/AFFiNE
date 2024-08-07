import { toast } from '@affine/component';
import { useDocCollectionHelper } from '@affine/core/hooks/use-block-suite-workspace-helper';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { DocsService, initEmptyPage, useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import type { DocCollection } from '../../../shared';

export const usePageHelper = (docCollection: DocCollection) => {
  const workbench = useService(WorkbenchService).workbench;
  const { createDoc } = useDocCollectionHelper(docCollection);
  const docRecordList = useService(DocsService).list;

  const isPreferredEdgeless = useCallback(
    (pageId: string) =>
      docRecordList.doc$(pageId).value?.mode$.value === 'edgeless',
    [docRecordList]
  );

  const createPageAndOpen = useCallback(
    (mode?: 'page' | 'edgeless', open?: boolean | 'new-tab') => {
      const page = createDoc();
      initEmptyPage(page);
      docRecordList.doc$(page.id).value?.setMode(mode || 'page');
      if (open !== false)
        workbench.openDoc(page.id, {
          at: open === 'new-tab' ? 'new-tab' : 'active',
        });
      return page;
    },
    [createDoc, docRecordList, workbench]
  );

  const createEdgelessAndOpen = useCallback(
    (open?: boolean | 'new-tab') => {
      return createPageAndOpen('edgeless', open);
    },
    [createPageAndOpen]
  );

  const importFileAndOpen = useMemo(
    () => async () => {
      const { showImportModal } = await import('@blocksuite/blocks');
      const { promise, resolve, reject } =
        Promise.withResolvers<
          Parameters<
            NonNullable<Parameters<typeof showImportModal>[0]['onSuccess']>
          >[1]
        >();
      const onSuccess = (
        pageIds: string[],
        options: { isWorkspaceFile: boolean; importedCount: number }
      ) => {
        resolve(options);
        toast(
          `Successfully imported ${options.importedCount} Page${
            options.importedCount > 1 ? 's' : ''
          }.`
        );
        if (options.isWorkspaceFile) {
          workbench.openAll();
          return;
        }

        if (pageIds.length === 0) {
          return;
        }
        const pageId = pageIds[0];
        workbench.openDoc(pageId);
      };
      showImportModal({
        collection: docCollection,
        onSuccess,
        onFail: message => {
          reject(new Error(message));
        },
      });
      return await promise;
    },
    [docCollection, workbench]
  );

  return useMemo(() => {
    return {
      isPreferredEdgeless,
      createPage: (open?: boolean | 'new-tab') =>
        createPageAndOpen('page', open),
      createEdgeless: createEdgelessAndOpen,
      importFile: importFileAndOpen,
    };
  }, [
    isPreferredEdgeless,
    createEdgelessAndOpen,
    createPageAndOpen,
    importFileAndOpen,
  ]);
};
