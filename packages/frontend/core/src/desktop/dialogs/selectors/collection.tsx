import { Modal, toast } from '@affine/component';
import {
  collectionHeaderColsDef,
  CollectionListItemRenderer,
  FavoriteTag,
  type ListItem,
  ListTableHeader,
  VirtualizedList,
} from '@affine/core/components/page-list';
import { SelectorLayout } from '@affine/core/components/page-list/selector/selector-layout';
import {
  type CollectionMeta,
  CollectionService,
} from '@affine/core/modules/collection';
import type { DialogComponentProps } from '@affine/core/modules/dialogs';
import type { WORKSPACE_DIALOG_SCHEMA } from '@affine/core/modules/dialogs/constant';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useCallback, useMemo, useState } from 'react';

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

export const CollectionSelectorDialog = ({
  close,
  init: selectedCollectionIds,
}: DialogComponentProps<WORKSPACE_DIALOG_SCHEMA['collection-selector']>) => {
  const t = useI18n();
  const collectionService = useService(CollectionService);
  const workspace = useService(WorkspaceService).workspace;

  const collections = useLiveData(collectionService.collectionMetas$);
  const [selection, setSelection] = useState(selectedCollectionIds);
  const [keyword, setKeyword] = useState('');

  const collectionMetas = useMemo(() => {
    const collectionsList: CollectionMeta[] = collections.filter(meta => {
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
    <Modal
      open
      onOpenChange={() => close()}
      withoutCloseButton
      width="calc(100% - 32px)"
      height="80%"
      contentOptions={{
        style: {
          padding: 0,
          maxWidth: 976,
          background: cssVar('backgroundPrimaryColor'),
        },
      }}
    >
      <SelectorLayout
        searchPlaceholder={t[
          'com.affine.selector-collection.search.placeholder'
        ]()}
        selectedCount={selection.length}
        onSearch={setKeyword}
        onClear={() => setSelection([])}
        onCancel={() => close()}
        onConfirm={() => close(selection)}
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
    </Modal>
  );
};
