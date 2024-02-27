import {
  AllPageListOperationsMenu,
  PageListNewPageButton,
} from '@affine/core/components/page-list';
import { Header } from '@affine/core/components/pure/header';
import { WindowsAppControls } from '@affine/core/components/pure/header/windows-app-controls';
import { WorkspaceModeFilterTab } from '@affine/core/components/pure/workspace-mode-filter-tab';
import type { Filter } from '@affine/env/filter';
import { PlusIcon } from '@blocksuite/icons';
import { useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
import clsx from 'clsx';
import { useMemo } from 'react';

import * as styles from './all-page.css';
import { FilterContainer } from './all-page-filter';

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
  const isWindowsDesktop = environment.isDesktop && environment.isWindows;

  const renderRightItem = useMemo(() => {
    return (
      <PageListNewPageButton
        size="small"
        className={clsx(
          styles.headerCreateNewButton,
          !showCreateNew && styles.headerCreateNewButtonHidden
        )}
      >
        <PlusIcon />
      </PageListNewPageButton>
    );
  }, [showCreateNew]);

  return (
    <>
      <Header
        left={
          <AllPageListOperationsMenu
            filterList={filters}
            onChangeFilterList={onChangeFilters}
            propertiesMeta={workspace.blockSuiteWorkspace.meta.properties}
          />
        }
        right={
          <div
            className={styles.headerRightWindows}
            data-is-windows-desktop={isWindowsDesktop}
          >
            {renderRightItem}
            {isWindowsDesktop ? <WindowsAppControls /> : null}
          </div>
        }
        center={<WorkspaceModeFilterTab activeFilter={'docs'} />}
      />
      <FilterContainer filters={filters} onChangeFilters={onChangeFilters} />
    </>
  );
};
