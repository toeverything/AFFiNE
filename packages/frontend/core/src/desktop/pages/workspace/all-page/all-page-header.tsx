import { usePageHelper } from '@affine/core/blocksuite/block-suite-page-list/utils';
import {
  AllPageListOperationsMenu,
  PageDisplayMenu,
  PageListNewPageButton,
} from '@affine/core/components/page-list';
import { Header } from '@affine/core/components/pure/header';
import { WorkspaceModeFilterTab } from '@affine/core/components/pure/workspace-mode-filter-tab';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { inferOpenMode } from '@affine/core/utils';
import type { Filter } from '@affine/env/filter';
import { track } from '@affine/track';
import { PlusIcon } from '@blocksuite/icons/rc';
import { useServices } from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback } from 'react';

import * as styles from './all-page.css';

export const AllPageHeader = ({
  showCreateNew,
  filters,
  onChangeFilters,
}: {
  showCreateNew: boolean;
  filters: Filter[];
  onChangeFilters: (filters: Filter[]) => void;
}) => {
  const { workspaceService, workspaceDialogService, workbenchService } =
    useServices({
      WorkspaceService,
      WorkspaceDialogService,
      WorkbenchService,
    });
  const workbench = workbenchService.workbench;
  const workspace = workspaceService.workspace;
  const { createEdgeless, createPage } = usePageHelper(workspace.docCollection);

  const handleOpenDocs = useCallback(
    (result: {
      docIds: string[];
      entryId?: string;
      isWorkspaceFile?: boolean;
    }) => {
      const { docIds, entryId, isWorkspaceFile } = result;
      // If the imported file is a workspace file, open the entry page.
      if (isWorkspaceFile && entryId) {
        workbench.openDoc(entryId);
      } else if (!docIds.length) {
        return;
      }
      // Open all the docs when there are multiple docs imported.
      if (docIds.length > 1) {
        workbench.openAll();
      } else {
        // Otherwise, open the only doc.
        workbench.openDoc(docIds[0]);
      }
    },
    [workbench]
  );

  const onImportFile = useCallback(() => {
    track.$.header.importModal.open();
    workspaceDialogService.open('import', undefined, payload => {
      if (!payload) {
        return;
      }
      handleOpenDocs(payload);
    });
  }, [workspaceDialogService, handleOpenDocs]);

  return (
    <Header
      left={
        <AllPageListOperationsMenu
          filterList={filters}
          onChangeFilterList={onChangeFilters}
          propertiesMeta={workspace.docCollection.meta.properties}
        />
      }
      right={
        <>
          <PageListNewPageButton
            size="small"
            className={clsx(
              styles.headerCreateNewButton,
              !showCreateNew && styles.headerCreateNewButtonHidden
            )}
            onCreateEdgeless={e => createEdgeless({ at: inferOpenMode(e) })}
            onCreatePage={e => createPage('page', { at: inferOpenMode(e) })}
            onCreateDoc={e => createPage(undefined, { at: inferOpenMode(e) })}
            onImportFile={onImportFile}
          >
            <PlusIcon />
          </PageListNewPageButton>
          <PageDisplayMenu />
        </>
      }
      center={<WorkspaceModeFilterTab activeFilter={'docs'} />}
    />
  );
};
