import { toast } from '@affine/component';
import { AppSidebarService } from '@affine/core/modules/app-sidebar';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { WorkbenchService } from '@affine/core/modules/workbench';
import {
  type DocMode,
  openFileOrFiles,
  ZipTransformer,
} from '@blocksuite/affine/blocks';
import type { DocCollection } from '@blocksuite/affine/store';
import { type DocProps, DocsService, useServices } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

export const usePageHelper = (docCollection: DocCollection) => {
  const {
    docsService,
    workbenchService,
    editorSettingService,
    appSidebarService,
  } = useServices({
    DocsService,
    WorkbenchService,
    EditorSettingService,
    AppSidebarService,
  });
  const workbench = workbenchService.workbench;
  const docRecordList = docsService.list;
  const appSidebar = appSidebarService.sidebar;

  const createPageAndOpen = useCallback(
    (mode?: DocMode, open?: boolean | 'new-tab') => {
      appSidebar.setHovering(false);
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
    [
      appSidebar,
      docRecordList,
      docsService,
      editorSettingService.editorSetting,
      workbench,
    ]
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

  const importSnapshotAndOpen = useCallback(async () => {
    try {
      const file = await openFileOrFiles({ acceptType: 'Zip' });
      if (!file) return;

      const importedDocs = await ZipTransformer.importDocs(docCollection, file);
      if (importedDocs.length === 0) {
        toast('No valid documents found in the imported file.');
        return;
      }

      toast(`Successfully imported ${importedDocs.length} doc(s).`);

      if (importedDocs.length > 1) {
        workbench.openAll();
      } else if (importedDocs[0]?.id) {
        workbench.openDoc(importedDocs[0].id);
      }
    } catch (error) {
      console.error('Error importing snapshot:', error);
      toast('Failed to import snapshot. Please try again.');
    }
  }, [docCollection, workbench]);

  return useMemo(() => {
    return {
      createPage: (mode?: DocMode, open?: boolean | 'new-tab') =>
        createPageAndOpen(mode, open),
      createEdgeless: createEdgelessAndOpen,
      importFile: importFileAndOpen,
      importSnapshotFile: importSnapshotAndOpen,
    };
  }, [
    createEdgelessAndOpen,
    createPageAndOpen,
    importFileAndOpen,
    importSnapshotAndOpen,
  ]);
};
