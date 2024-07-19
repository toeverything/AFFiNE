import { Button, Menu } from '@affine/component';
import { FavoriteItemsAdapter } from '@affine/core/modules/properties';
import { Trans, useI18n } from '@affine/i18n';
import { FilterIcon } from '@blocksuite/icons/rc';
import type { DocMeta } from '@blocksuite/store';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { type ReactNode, useCallback, useState } from 'react';

import { FilterList } from '../../filter';
import { VariableSelect } from '../../filter/vars';
import { usePageHeaderColsDef } from '../../header-col-def';
import { PageListItemRenderer } from '../../page-group';
import { ListTableHeader } from '../../page-header';
import type { ListItem } from '../../types';
import { VirtualizedList } from '../../virtualized-list';
import { AffineShapeIcon } from '../affine-shape';
import type { AllPageListConfig } from './edit-collection';
import * as styles from './edit-collection.css';
import { useFilter } from './use-filter';
import { useSearch } from './use-search';

export const SelectPage = ({
  allPageListConfig,
  init,
  onConfirm,
  onCancel,
  onChange: propsOnChange,
  confirmText,
  header,
  buttons,
}: {
  allPageListConfig: AllPageListConfig;
  init: string[];
  onConfirm?: (pageIds: string[]) => void;
  onCancel?: () => void;
  onChange?: (values: string[]) => void;
  confirmText?: ReactNode;
  header?: ReactNode;
  buttons?: ReactNode;
}) => {
  const t = useI18n();
  const [value, setValue] = useState(init);
  const onChange = useCallback(
    (value: string[]) => {
      propsOnChange?.(value);
      setValue(value);
    },
    [propsOnChange]
  );
  const confirm = useCallback(() => {
    onConfirm?.(value);
  }, [value, onConfirm]);
  const clearSelected = useCallback(() => {
    onChange([]);
  }, [onChange]);
  const favAdapter = useService(FavoriteItemsAdapter);
  const favourites = useLiveData(favAdapter.favorites$);
  const pageHeaderColsDef = usePageHeaderColsDef();
  const {
    clickFilter,
    createFilter,
    filters,
    showFilter,
    updateFilters,
    filteredList,
  } = useFilter(
    allPageListConfig.allPages.map(meta => ({
      meta,
      publicMode: allPageListConfig.getPublicMode(meta.id),
      favorite: favourites.some(fav => fav.id === meta.id),
    }))
  );
  const { searchText, updateSearchText, searchedList } =
    useSearch(filteredList);

  const operationsRenderer = useCallback(
    (item: ListItem) => {
      const page = item as DocMeta;
      return allPageListConfig.favoriteRender(page);
    },
    [allPageListConfig]
  );

  const pageHeaderRenderer = useCallback(() => {
    return <ListTableHeader headerCols={pageHeaderColsDef} />;
  }, [pageHeaderColsDef]);

  const pageItemRenderer = useCallback((item: ListItem) => {
    return <PageListItemRenderer {...item} />;
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <input
        className={styles.rulesTitle}
        value={searchText}
        onChange={e => updateSearchText(e.target.value)}
        placeholder={t['com.affine.editCollection.search.placeholder']()}
      ></input>
      <div className={styles.pagesTab}>
        <div className={styles.pagesTabContent}>
          {header ?? (
            <div style={{ fontSize: 12, lineHeight: '20px', fontWeight: 600 }}>
              {t['com.affine.selectPage.title']()}
            </div>
          )}
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
            docCollection={allPageListConfig.docCollection}
            selectable
            onSelectedIdsChange={onChange}
            selectedIds={value}
            isPreferredEdgeless={allPageListConfig.isEdgeless}
            operationsRenderer={operationsRenderer}
            itemRenderer={pageItemRenderer}
            headerRenderer={pageHeaderRenderer}
          />
        ) : (
          <EmptyList search={searchText} />
        )}
      </div>
      <div className={styles.pagesBottom}>
        <div className={styles.pagesBottomLeft}>
          <div className={styles.selectedCountTips}>
            {t['com.affine.selectPage.selected']()}
            <span
              style={{ marginLeft: 7 }}
              className={styles.previewCountTipsHighlight}
            >
              {value.length}
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
        <div>
          {buttons ?? (
            <>
              <Button size="large" onClick={onCancel}>
                {t['com.affine.editCollection.button.cancel']()}
              </Button>
              <Button
                className={styles.confirmButton}
                size="large"
                data-testid="save-collection"
                type="primary"
                onClick={confirm}
              >
                {confirmText ?? t['Confirm']()}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
export const EmptyList = ({ search }: { search?: string }) => {
  const t = useI18n();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        flex: 1,
      }}
    >
      <AffineShapeIcon />
      <div
        style={{
          margin: '18px 0',
          fontSize: 20,
          lineHeight: '28px',
          fontWeight: 600,
        }}
      >
        {t['com.affine.selectPage.empty']()}
      </div>
      {search ? (
        <div
          className={styles.ellipsis}
          style={{ maxWidth: 300, fontSize: 15, lineHeight: '24px' }}
        >
          <Trans i18nKey="com.affine.selectPage.empty.tips" values={{ search }}>
            No page titles contain
            <span
              style={{ fontWeight: 600, color: 'var(--affine-primary-color)' }}
            >
              search
            </span>
          </Trans>
        </div>
      ) : null}
    </div>
  );
};
