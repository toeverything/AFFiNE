import { toast } from '@affine/component';
import { CollectionService } from '@affine/core/modules/collection';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import { useCallback, useMemo, useState } from 'react';

import { FavoriteTag } from '../components/favorite-tag';
import { collectionHeaderColsDef } from '../header-col-def';
import { CollectionListItemRenderer } from '../page-group';
import { ListTableHeader } from '../page-header';
import type { BaseSelectorDialogProps } from '../selector';
import { SelectorLayout } from '../selector/selector-layout';
import type { CollectionMeta, ListItem } from '../types';
import { VirtualizedList } from '../virtualized-list';

const FavoriteOperation = ({ collection }: { collection: ListItem }) => {
  const t = useI18n();
  const favAdapter = useService(CompatibleFavoriteItemsAdapter);
  const isFavorite = useLiveData(
    favAdapter.isFavorite$(collection.id, 'collection')
  );

  const onToggleFavoriteCollection = useCallback(() => {
    favAdapter.toggle(collection.id, 'collection');
    toast(
      isFavorite
        ? t['com.affine.toastMessage.removedFavorites']()
        : t['com.affine.toastMessage.addedFavorites']()
    );
  }, [collection.id, favAdapter, isFavorite, t]);

  return (
    <FavoriteTag
      style={{ marginRight: 8 }}
      onClick={onToggleFavoriteCollection}
      active={isFavorite}
    />
  );
};

export const SelectCollection = ({
  init = [],
  onCancel,
  onConfirm,
}: BaseSelectorDialogProps<string[]>) => {
  const t = useI18n();
  const collectionService = useService(CollectionService);
  const workspace = useService(WorkspaceService).workspace;

  const collections = useLiveData(collectionService.collections$);
  const [selection, setSelection] = useState(init);
  const [keyword, setKeyword] = useState('');

  const collectionMetas = useMemo(() => {
    const collectionsList: CollectionMeta[] = collections
      .map(collection => {
        return {
          ...collection,
          title: collection.name,
        };
      })
      .filter(meta => {
        const reg = new RegExp(keyword, 'i');
        return reg.test(meta.title);
      });
    return collectionsList;
  }, [collections, keyword]);

  const collectionItemRenderer = useCallback((item: ListItem) => {
    return <CollectionListItemRenderer {...item} />;
  }, []);

  const collectionHeaderRenderer = useCallback(() => {
    return <ListTableHeader headerCols={collectionHeaderColsDef} />;
  }, []);

  const collectionOperationRenderer = useCallback((item: ListItem) => {
    return <FavoriteOperation collection={item} />;
  }, []);

  return (
    <SelectorLayout
      searchPlaceholder={t[
        'com.affine.selector-collection.search.placeholder'
      ]()}
      selectedCount={selection.length}
      onSearch={setKeyword}
      onClear={() => setSelection([])}
      onCancel={() => onCancel?.()}
      onConfirm={() => onConfirm?.(selection)}
    >
      <VirtualizedList
        selectable={true}
        draggable={false}
        selectedIds={selection}
        onSelectedIdsChange={setSelection}
        items={collectionMetas}
        itemRenderer={collectionItemRenderer}
        rowAsLink
        docCollection={workspace.docCollection}
        operationsRenderer={collectionOperationRenderer}
        headerRenderer={collectionHeaderRenderer}
      />
    </SelectorLayout>
  );
};
