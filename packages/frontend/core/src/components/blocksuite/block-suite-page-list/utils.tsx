import { toast } from '@affine/component';
import { useDocCollectionHelper } from '@affine/core/hooks/use-block-suite-workspace-helper';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { WorkbenchService } from '@affine/core/modules/workbench';
import {
  type DocMode,
  DocsService,
  initEmptyPage,
  useLiveData,
  useServices,
} from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import type { DocCollection } from '../../../shared';

export const usePageHelper = (docCollection: DocCollection) => {
  const { docsService, workbenchService, editorSettingService } = useServices({
    DocsService,
    WorkbenchService,
    EditorSettingService,
  });
  const workbench = workbenchService.workbench;
  const { createDoc } = useDocCollectionHelper(docCollection);
  const docRecordList = docsService.list;
  const settings = useLiveData(editorSettingService.editorSetting.settings$);

  const createPageAndOpen = useCallback(
    (mode?: DocMode, open?: boolean | 'new-tab') => {
      const page = createDoc();
      initEmptyPage(page);
      const primaryMode = mode || settings.newDocDefaultMode;
      docRecordList.doc$(page.id).value?.setPrimaryMode(primaryMode);
      if (open !== false)
        workbench.openDoc(page.id, {
          at: open === 'new-tab' ? 'new-tab' : 'active',
        });
      return page;
    },
    [createDoc, docRecordList, settings.newDocDefaultMode, workbench]
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
      createPage: (mode?: DocMode, open?: boolean | 'new-tab') =>
        createPageAndOpen(mode, open),
      createEdgeless: createEdgelessAndOpen,
      importFile: importFileAndOpen,
    };
  }, [createEdgelessAndOpen, createPageAndOpen, importFileAndOpen]);
};
