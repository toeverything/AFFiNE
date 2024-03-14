import { Menu } from '@affine/component';
import type { Collection } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FilterIcon } from '@blocksuite/icons';
import type { DocMeta } from '@blocksuite/store';
import clsx from 'clsx';
import { type ReactNode, useCallback } from 'react';

import { FilterList } from '../../filter/filter-list';
import { VariableSelect } from '../../filter/vars';
import { pageHeaderColsDef } from '../../header-col-def';
import { PageListItemRenderer } from '../../page-group';
import { ListTableHeader } from '../../page-header';
import type { ListItem } from '../../types';
import { VirtualizedList } from '../../virtualized-list';
import type { AllPageListConfig } from './edit-collection';
import * as styles from './edit-collection.css';
import { EmptyList } from './select-page';
import { useFilter } from './use-filter';
import { useSearch } from './use-search';

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
  } = useFilter(
    allPageListConfig.allPages.map(meta => ({
      meta,
      publicMode: allPageListConfig.getPublicMode(meta.id),
    }))
  );
  const { searchText, updateSearchText, searchedList } =
    useSearch(filteredList);
  const clearSelected = useCallback(() => {
    updateCollection({
      ...collection,
      allowList: [],
    });
  }, [collection, updateCollection]);
  const pageOperationsRenderer = useCallback(
    (item: ListItem) => {
      const page = item as DocMeta;
      return allPageListConfig.favoriteRender(page);
    },
    [allPageListConfig]
  );

  const pageItemRenderer = useCallback((item: ListItem) => {
    return <PageListItemRenderer {...item} />;
  }, []);
  const pageHeaderRenderer = useCallback(() => {
    return <ListTableHeader headerCols={pageHeaderColsDef} />;
  }, []);
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
                    propertiesMeta={
                      allPageListConfig.docCollection.meta.properties
                    }
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
                propertiesMeta={allPageListConfig.docCollection.meta.properties}
                value={filters}
                onChange={updateFilters}
              />
            </div>
          ) : null}
          {searchedList.length ? (
            <VirtualizedList
              className={styles.pageList}
              items={searchedList}
              groupBy={false}
              docCollection={allPageListConfig.docCollection}
              selectable
              onSelectedIdsChange={ids => {
                updateCollection({
                  ...collection,
                  allowList: ids,
                });
              }}
              itemRenderer={pageItemRenderer}
              operationsRenderer={pageOperationsRenderer}
              headerRenderer={pageHeaderRenderer}
              selectedIds={collection.allowList}
              isPreferredEdgeless={allPageListConfig.isEdgeless}
            />
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
