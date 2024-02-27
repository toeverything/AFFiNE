import { HubIsland } from '@affine/core/components/affine/hub-island';
import {
  PageListHeader,
  useFilteredPageMetas,
  VirtualizedPageList,
} from '@affine/core/components/page-list';
import { useBlockSuitePageMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { performanceRenderLogger } from '@affine/core/shared';
import type { Filter } from '@affine/env/filter';
import { useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
import { useEffect, useState } from 'react';

import { EmptyPageList } from '../page-list-empty';
import * as styles from './all-page.css';
import { AllPageHeader } from './all-page-header';

export const AllPage = () => {
  const currentWorkspace = useService(Workspace);
  const pageMetas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);
  const [hideHeaderCreateNew, setHideHeaderCreateNew] = useState(true);

  const [filters, setFilters] = useState<Filter[]>([]);
  const filteredPageMetas = useFilteredPageMetas(currentWorkspace, pageMetas, {
    filters: filters,
  });

  return (
    <div className={styles.root}>
      <AllPageHeader
        showCreateNew={!hideHeaderCreateNew}
        filters={filters}
        onChangeFilters={setFilters}
      />
      {filteredPageMetas.length > 0 ? (
        <VirtualizedPageList
          setHideHeaderCreateNewPage={setHideHeaderCreateNew}
          filters={filters}
        />
      ) : (
        <EmptyPageList
          type="all"
          heading={<PageListHeader />}
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        />
      )}
      <HubIsland />
    </div>
  );
};

export const Component = () => {
  performanceRenderLogger.info('AllPage');

  const currentWorkspace = useService(Workspace);
  const navigateHelper = useNavigateHelper();

  useEffect(() => {
    function checkJumpOnce() {
      for (const [pageId] of currentWorkspace.blockSuiteWorkspace.pages) {
        const page = currentWorkspace.blockSuiteWorkspace.getPage(pageId);
        if (page && page.meta.jumpOnce) {
          currentWorkspace.blockSuiteWorkspace.meta.setPageMeta(page.id, {
            jumpOnce: false,
          });
          navigateHelper.jumpToPage(currentWorkspace.id, pageId);
        }
      }
    }
    checkJumpOnce();
    return currentWorkspace.blockSuiteWorkspace.slots.pagesUpdated.on(
      checkJumpOnce
    ).dispose;
  }, [
    currentWorkspace.blockSuiteWorkspace,
    currentWorkspace.id,
    navigateHelper,
  ]);

  return <AllPage />;
};
