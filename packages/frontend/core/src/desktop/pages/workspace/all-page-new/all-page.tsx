import { ExplorerDisplayMenuButton } from '@affine/core/components/explorer/display-menu';
import type { ExplorerPreference } from '@affine/core/components/explorer/types';
import { Filters } from '@affine/core/components/filter';
import { CollectionRulesService } from '@affine/core/modules/collection-rules';
import type { FilterParams } from '@affine/core/modules/collection-rules/types';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '../../../../modules/workbench';
import { AllDocSidebarTabs } from '../layouts/all-doc-sidebar-tabs';
import * as styles from './all-page.css';
import { MigrationAllDocsDataNotification } from './migration-data';
export const AllPage = () => {
  const t = useI18n();

  const [explorerPreference, setExplorerPreference] =
    useState<ExplorerPreference>({});

  const [groups, setGroups] = useState<any>([]);

  const collectionRulesService = useService(CollectionRulesService);
  useEffect(() => {
    const subscription = collectionRulesService
      .watch(
        explorerPreference.filters ?? [],
        explorerPreference.groupBy,
        explorerPreference.orderBy
      )
      .subscribe({
        next: result => {
          setGroups(result.groups);
        },
        error: error => {
          console.error(error);
        },
      });
    return () => {
      subscription.unsubscribe();
    };
  }, [collectionRulesService, explorerPreference]);

  const handleFilterChange = useCallback((filters: FilterParams[]) => {
    setExplorerPreference(prev => ({
      ...prev,
      filters,
    }));
  }, []);
  return (
    <>
      <ViewTitle title={t['All pages']()} />
      <ViewIcon icon="allDocs" />
      <ViewHeader></ViewHeader>
      <ViewBody>
        <div className={styles.body}>
          <MigrationAllDocsDataNotification />
          <div>
            <Filters
              filters={explorerPreference.filters ?? []}
              onChange={handleFilterChange}
            />
            <ExplorerDisplayMenuButton
              preference={explorerPreference}
              onChange={setExplorerPreference}
            />
          </div>
          <pre>{JSON.stringify(explorerPreference, null, 2)}</pre>
          <pre>{JSON.stringify(groups, null, 2)}</pre>
        </div>
      </ViewBody>
      <AllDocSidebarTabs />
    </>
  );
};

export const Component = () => {
  return <AllPage />;
};
