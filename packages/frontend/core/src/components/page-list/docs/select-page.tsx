import { IconButton, Menu, toast } from '@affine/component';
import { useBlockSuiteDocMeta } from '@affine/core/components/hooks/use-block-suite-page-meta';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import { ShareDocsListService } from '@affine/core/modules/share-doc';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { PublicDocMode } from '@affine/graphql';
import { Trans, useI18n } from '@affine/i18n';
import type { DocMeta } from '@blocksuite/affine/store';
import { FilterIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { AffineShapeIcon, FavoriteTag } from '..';
import { FilterList } from '../filter';
import { VariableSelect } from '../filter/vars';
import { usePageHeaderColsDef } from '../header-col-def';
import { PageListItemRenderer } from '../page-group';
import { ListTableHeader } from '../page-header';
import { SelectorLayout } from '../selector/selector-layout';
import type { ListItem } from '../types';
import { VirtualizedList } from '../virtualized-list';
import * as styles from './select-page.css';
import { useFilter } from './use-filter';
import { useSearch } from './use-search';

export const SelectPage = ({
  init = [],
  onConfirm,
  onCancel,
  onChange: propsOnChange,
  header,
  buttons,
}: {
  onChange?: (values: string[]) => void;
  confirmText?: ReactNode;
  header?: ReactNode;
  buttons?: ReactNode;
  init?: string[];
  onConfirm?: (data: string[]) => void;
  onCancel?: () => void;
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
  const {
    workspaceService,
    compatibleFavoriteItemsAdapter,
    shareDocsListService,
  } = useServices({
    ShareDocsListService,
    WorkspaceService,
    CompatibleFavoriteItemsAdapter,
  });
  const shareDocs = useLiveData(shareDocsListService.shareDocs?.list$);
  const workspace = workspaceService.workspace;
  const docCollection = workspace.docCollection;
  const pageMetas = useBlockSuiteDocMeta(docCollection);
  const favourites = useLiveData(compatibleFavoriteItemsAdapter.favorites$);

  useEffect(() => {
    shareDocsListService.shareDocs?.revalidate();
  }, [shareDocsListService.shareDocs]);

  const getPublicMode = useCallback(
    (id: string) => {
      const mode = shareDocs?.find(shareDoc => shareDoc.id === id)?.mode;
      if (mode === PublicDocMode.Edgeless) {
        return 'edgeless';
      } else if (mode === PublicDocMode.Page) {
        return 'page';
      } else {
        return undefined;
      }
    },
    [shareDocs]
  );

  const isFavorite = useCallback(
    (meta: DocMeta) => favourites.some(fav => fav.id === meta.id),
    [favourites]
  );

  const onToggleFavoritePage = useCallback(
    (page: DocMeta) => {
      const status = isFavorite(page);
      compatibleFavoriteItemsAdapter.toggle(page.id, 'doc');
      toast(
        status
          ? t['com.affine.toastMessage.removedFavorites']()
          : t['com.affine.toastMessage.addedFavorites']()
      );
    },
    [compatibleFavoriteItemsAdapter, isFavorite, t]
  );

  const pageHeaderColsDef = usePageHeaderColsDef();
  const {
    clickFilter,
    createFilter,
    filters,
    showFilter,
    updateFilters,
    filteredList,
  } = useFilter(
    pageMetas.map(meta => ({
      meta,
      publicMode: getPublicMode(meta.id),
      favorite: isFavorite(meta),
    }))
  );
  const { searchText, updateSearchText, searchedList } =
    useSearch(filteredList);

  const operationsRenderer = useCallback(
    (item: ListItem) => {
      const page = item as DocMeta;
      return (
        <FavoriteTag
          style={{ marginRight: 8 }}
          onClick={() => onToggleFavoritePage(page)}
          active={isFavorite(page)}
        />
      );
    },
    [isFavorite, onToggleFavoritePage]
  );

  const pageHeaderRenderer = useCallback(() => {
    return <ListTableHeader headerCols={pageHeaderColsDef} />;
  }, [pageHeaderColsDef]);

  const pageItemRenderer = useCallback((item: ListItem) => {
    return <PageListItemRenderer {...item} />;
  }, []);

  return (
    <SelectorLayout
      searchPlaceholder={t['com.affine.editCollection.search.placeholder']()}
      selectedCount={value.length}
      onSearch={updateSearchText}
      onClear={clearSelected}
      onCancel={onCancel}
      onConfirm={confirm}
      actions={buttons}
    >
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
                  propertiesMeta={docCollection.meta.properties}
                  selected={filters}
                  onSelect={createFilter}
                />
              }
            >
              <IconButton icon={<FilterIcon />} onClick={clickFilter} />
            </Menu>
          ) : (
            <IconButton icon={<FilterIcon />} onClick={clickFilter} />
          )}
        </div>
        {showFilter ? (
          <div style={{ padding: '12px 16px 16px' }}>
            <FilterList
              propertiesMeta={docCollection.meta.properties}
              value={filters}
              onChange={updateFilters}
            />
          </div>
        ) : null}
        {searchedList.length ? (
          <VirtualizedList
            className={styles.pageList}
            items={searchedList}
            docCollection={docCollection}
            selectable
            onSelectedIdsChange={onChange}
            selectedIds={value}
            operationsRenderer={operationsRenderer}
            itemRenderer={pageItemRenderer}
            headerRenderer={pageHeaderRenderer}
          />
        ) : (
          <EmptyList search={searchText} />
        )}
      </div>
    </SelectorLayout>
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
