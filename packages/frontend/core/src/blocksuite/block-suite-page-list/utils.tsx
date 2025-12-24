import { toast } from '@affine/component';
import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { AppSidebarService } from '@affine/core/modules/app-sidebar';
import { DocsService } from '@affine/core/modules/doc';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { getAFFiNEWorkspaceSchema } from '@affine/core/modules/workspace';
import { type DocMode } from '@blocksuite/affine/model';
import type { Workspace } from '@blocksuite/affine/store';
import { useServices } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

export const usePageHelper = (docCollection: Workspace) => {
  const { docsService, workbenchService, appSidebarService } = useServices({
    DocsService,
    WorkbenchService,
    AppSidebarService,
  });
  const workbench = workbenchService.workbench;
  const docRecordList = docsService.list;
  const appSidebar = appSidebarService.sidebar;

  const createPageAndOpen = useCallback(
    (
      mode?: DocMode,
      options: {
        at?: 'new-tab' | 'tail' | 'active';
        show?: boolean;
      } = {
        at: 'active',
        show: true,
      }
    ) => {
      appSidebar.setHovering(false);
      const page = docsService.createDoc();

      if (mode) {
        docRecordList.doc$(page.id).value?.setPrimaryMode(mode);
      }

      if (options.show !== false) {
        workbench.openDoc(page.id, {
          at: options.at,
          show: options.show,
        });
      }
      return page;
    },
    [appSidebar, docRecordList, docsService, workbench]
  );

  const createEdgelessAndOpen = useCallback(
    (
      options: {
        at?: 'new-tab' | 'tail' | 'active';
        show?: boolean;
      } = {
        at: 'active',
        show: true,
      }
    ) => {
      return createPageAndOpen('edgeless', options);
    },
    [createPageAndOpen]
  );

  const importFileAndOpen = useMemo(
    () => async () => {
      const { showImportModal } =
        await import('@blocksuite/affine/widgets/linked-doc');
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
        schema: getAFFiNEWorkspaceSchema(),
        extensions: getStoreManager().config.init().value.get('store'),
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
      createPage: (
        mode?: DocMode,
        options?: {
          at?: 'new-tab' | 'tail' | 'active';
          show?: boolean;
        }
      ) => createPageAndOpen(mode, options),
      createEdgeless: createEdgelessAndOpen,
      importFile: importFileAndOpen,
    };
  }, [createEdgelessAndOpen, createPageAndOpen, importFileAndOpen]);
};
