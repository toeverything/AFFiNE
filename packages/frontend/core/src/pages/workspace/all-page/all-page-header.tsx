import { usePageHelper } from '@affine/core/components/blocksuite/block-suite-page-list/utils';
import {
  AllPageListOperationsMenu,
  PageDisplayMenu,
  PageListNewPageButton,
} from '@affine/core/components/page-list';
import { Header } from '@affine/core/components/pure/header';
import { WorkspaceModeFilterTab } from '@affine/core/components/pure/workspace-mode-filter-tab';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { mixpanel } from '@affine/core/utils';
import type { Filter } from '@affine/env/filter';
import { PlusIcon } from '@blocksuite/icons/rc';
import { useService, WorkspaceService } from '@toeverything/infra';
import clsx from 'clsx';

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
  const workspace = useService(WorkspaceService).workspace;
  const { importFile, createEdgeless, createPage } = usePageHelper(
    workspace.docCollection
  );

  const onImportFile = useAsyncCallback(async () => {
    const options = await importFile();
    if (options.isWorkspaceFile) {
      mixpanel.track('WorkspaceCreated', {
        page: 'doc library',
        segment: 'all page',
        module: 'doc list header',
        control: 'import button',
        type: 'imported workspace',
      });
    } else {
      mixpanel.track('DocCreated', {
        page: 'doc library',
        segment: 'all page',
        module: 'doc list header',
        control: 'import button',
        type: 'imported doc',
        // category
      });
    }
  }, [importFile]);

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
            onCreateEdgeless={createEdgeless}
            onCreatePage={createPage}
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
