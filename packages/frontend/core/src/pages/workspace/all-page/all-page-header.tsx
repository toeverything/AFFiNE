import { usePageHelper } from '@affine/core/components/blocksuite/block-suite-page-list/utils';
import {
  AllPageListOperationsMenu,
  PageDisplayMenu,
  PageListNewPageButton,
} from '@affine/core/components/page-list';
import { Header } from '@affine/core/components/pure/header';
import { WorkspaceModeFilterTab } from '@affine/core/components/pure/workspace-mode-filter-tab';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { track } from '@affine/core/mixpanel';
import { isNewTabTrigger } from '@affine/core/utils';
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
      track.allDocs.header.actions.createWorkspace({
        control: 'import',
      });
    } else {
      track.allDocs.header.actions.createDoc({
        control: 'import',
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
            onCreateEdgeless={e =>
              createEdgeless(isNewTabTrigger(e) ? 'new-tab' : true)
            }
            onCreatePage={e =>
              createPage(isNewTabTrigger(e) ? 'new-tab' : true)
            }
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
