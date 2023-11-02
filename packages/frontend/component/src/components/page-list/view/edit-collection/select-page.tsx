import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FilterIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Menu } from '@toeverything/components/menu';
import clsx from 'clsx';
import { useCallback, useState } from 'react';

import { VirtualizedPageList } from '../..';
import { FilterList } from '../../filter';
import { VariableSelect } from '../../filter/vars';
import { AffineShapeIcon } from '../affine-shape';
import type { AllPageListConfig } from './edit-collection';
import * as styles from './edit-collection.css';
import { useFilter, useSearch } from './hooks';
export const SelectPage = ({
  allPageListConfig,
  init,
  onConfirm,
  onCancel,
}: {
  allPageListConfig: AllPageListConfig;
  init: string[];
  onConfirm: (pageIds: string[]) => void;
  onCancel: () => void;
}) => {
  const t = useAFFiNEI18N();
  const [value, onChange] = useState(init);
  const confirm = useCallback(() => {
    onConfirm(value);
  }, [value, onConfirm]);
  const clearSelected = useCallback(() => {
    onChange([]);
  }, []);
  const {
    clickFilter,
    createFilter,
    filters,
    showFilter,
    updateFilters,
    filteredList,
  } = useFilter(allPageListConfig.allPages);
  const { searchText, updateSearchText, searchedList } =
    useSearch(filteredList);
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
          <div style={{ fontSize: 12, lineHeight: '20px', fontWeight: 600 }}>
            {t['com.affine.selectPage.title']()}
          </div>
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
            blockSuiteWorkspace={allPageListConfig.workspace}
            selectable
            groupBy={false}
            onSelectedPageIdsChange={onChange}
            selectedPageIds={value}
            isPreferredEdgeless={allPageListConfig.isEdgeless}
            pageOperationsRenderer={allPageListConfig.favoriteRender}
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
            {t['Confirm']()}
          </Button>
        </div>
      </div>
    </div>
  );
};
export const EmptyList = ({ search }: { search?: string }) => {
  const t = useAFFiNEI18N();
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
