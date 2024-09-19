import { toast } from '@affine/component';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { WorkbenchService } from '@affine/core/modules/workbench';
import type { DocMode } from '@blocksuite/affine/blocks';
import type { DocCollection } from '@blocksuite/affine/store';
import { type DocProps, DocsService, useServices } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

export const usePageHelper = (docCollection: DocCollection) => {
  const { docsService, workbenchService, editorSettingService } = useServices({
    DocsService,
    WorkbenchService,
    EditorSettingService,
  });
  const workbench = workbenchService.workbench;
  const docRecordList = docsService.list;

  const createPageAndOpen = useCallback(
    (mode?: DocMode, open?: boolean | 'new-tab') => {
      const docProps: DocProps = {
        note: editorSettingService.editorSetting.get('affine:note'),
      };
      const page = docsService.createDoc({ docProps });
      if (mode) {
        docRecordList.doc$(page.id).value?.setPrimaryMode(mode);
      }

      if (open !== false)
        workbench.openDoc(page.id, {
          at: open === 'new-tab' ? 'new-tab' : 'active',
        });
      return page;
    },
    [docRecordList, docsService, editorSettingService, workbench]
  );

  const createEdgelessAndOpen = useCallback(
    (open?: boolean | 'new-tab') => {
      return createPageAndOpen('edgeless', open);
    },
    [createPageAndOpen]
  );

  const importFileAndOpen = useMemo(
    () => async () => {
      const { showImportModal } = await import('@blocksuite/affine/blocks');
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
