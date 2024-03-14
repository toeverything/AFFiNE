import {
  AllPageListOperationsMenu,
  PageListNewPageButton,
} from '@affine/core/components/page-list';
import { Header } from '@affine/core/components/pure/header';
import { WorkspaceModeFilterTab } from '@affine/core/components/pure/workspace-mode-filter-tab';
import type { Filter } from '@affine/env/filter';
import { PlusIcon } from '@blocksuite/icons';
import { useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
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
  const workspace = useService(Workspace);

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
        <PageListNewPageButton
          size="small"
          className={clsx(
            styles.headerCreateNewButton,
            !showCreateNew && styles.headerCreateNewButtonHidden
          )}
        >
          <PlusIcon />
        </PageListNewPageButton>
      }
      center={<WorkspaceModeFilterTab activeFilter={'docs'} />}
    />
  );
};
