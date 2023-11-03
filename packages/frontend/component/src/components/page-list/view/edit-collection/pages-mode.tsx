import {
  type AllPageListConfig,
  FilterList,
  VirtualizedPageList,
} from '@affine/component/page-list';
import type { Collection } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FilterIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { Menu } from '@toeverything/components/menu';
import clsx from 'clsx';
import { type ReactNode, useCallback } from 'react';

import { VariableSelect } from '../../filter/vars';
import * as styles from './edit-collection.css';
import { useFilter, useSearch } from './hooks';
import { EmptyList } from './select-page';

export const PagesMode = ({
  switchMode,
  collection,
  updateCollection,
  buttons,
  allPageListConfig,
}: {
  collection: Collection;
  updateCollection: (collection: Collection) => void;
  buttons: ReactNode;
  switchMode: ReactNode;
  allPageListConfig: AllPageListConfig;
}) => {
  const t = useAFFiNEI18N();
  const {
    showFilter,
    filters,
    updateFilters,
    clickFilter,
    createFilter,
    filteredList,
  } = useFilter(allPageListConfig.allPages);
  const { searchText, updateSearchText, searchedList } =
    useSearch(filteredList);
  const clearSelected = useCallback(() => {
    updateCollection({
      ...collection,
      allowList: [],
    });
  }, [collection, updateCollection]);
  const pageOperationsRenderer = useCallback(
    (page: PageMeta) => allPageListConfig.favoriteRender(page),
    [allPageListConfig]
  );
  return (
    <>
      <input
        value={searchText}
        onChange={e => updateSearchText(e.target.value)}
        className={styles.rulesTitle}
        style={{
          color: 'var(--affine-text-primary-color)',
        }}
        placeholder={t['com.affine.editCollection.search.placeholder']()}
      ></input>
      <div className={styles.pagesList}>
        <div className={styles.pagesTab}>
          <div className={styles.pagesTabContent}>
            {switchMode}
            {!showFilter && filters.length === 0 ? (
              <Menu
                items={
                  <VariableSelect
                    propertiesMeta={allPageListConfig.workspace.meta.properties}
                    selected={filters}
                    onSelect={createFilter}
                  />
                }
              >
                <div>
                  <FilterIcon
                    className={clsx(styles.icon, styles.button)}
                    onClick={clickFilter}
                    width={24}
                    height={24}
                  ></FilterIcon>
                </div>
              </Menu>
            ) : (
              <FilterIcon
                className={clsx(styles.icon, styles.button)}
                onClick={clickFilter}
                width={24}
                height={24}
              ></FilterIcon>
            )}
          </div>
          {showFilter ? (
            <div style={{ padding: '12px 16px 16px' }}>
              <FilterList
                propertiesMeta={allPageListConfig.workspace.meta.properties}
                value={filters}
                onChange={updateFilters}
              />
            </div>
          ) : null}
          {searchedList.length ? (
            <VirtualizedPageList
              className={styles.pageList}
              pages={searchedList}
              groupBy={false}
              blockSuiteWorkspace={allPageListConfig.workspace}
              selectable
              onSelectedPageIdsChange={ids => {
                updateCollection({
                  ...collection,
                  allowList: ids,
                });
              }}
              pageOperationsRenderer={pageOperationsRenderer}
              selectedPageIds={collection.allowList}
              isPreferredEdgeless={allPageListConfig.isEdgeless}
            ></VirtualizedPageList>
          ) : (
            <EmptyList search={searchText} />
          )}
        </div>
      </div>
      <div className={styles.pagesBottom}>
        <div className={styles.pagesBottomLeft}>
          <div className={styles.selectedCountTips}>
            {t['com.affine.selectPage.selected']()}
            <span
              style={{ marginLeft: 7 }}
              className={styles.previewCountTipsHighlight}
            >
              {collection.allowList.length}
            </span>
          </div>
          <div
            className={clsx(styles.button, styles.bottomButton)}
            style={{ fontSize: 12, lineHeight: '20px' }}
            onClick={clearSelected}
          >
            {t['com.affine.editCollection.pages.clear']()}
          </div>
        </div>
        <div>{buttons}</div>
      </div>
    </>
  );
};
