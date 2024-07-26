import { TagService } from '@affine/core/modules/tag';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import { useCallback, useMemo, useState } from 'react';

import { tagHeaderColsDef } from '../header-col-def';
import { TagListItemRenderer } from '../page-group';
import { ListTableHeader } from '../page-header';
import type { BaseSelectorDialogProps } from '../selector';
import { SelectorLayout } from '../selector/selector-layout';
import type { ListItem, TagMeta } from '../types';
import { VirtualizedList } from '../virtualized-list';

// TODO(@EYHN): add tag to favourite support
const FavoriteOperation = ({ tag: _ }: { tag: ListItem }) => {
  //   const t = useI18n();
  //   const favAdapter = useService(FavoriteItemsAdapter);
  //   const isFavorite = useLiveData(
  //     favAdapter.isFavorite$(tag.id, 'tag')
  //   );

  //   const onToggleFavoriteCollection = useCallback(() => {
  //     favAdapter.toggle(tag.id, 'tag');
  //     toast(
  //       isFavorite
  //         ? t['com.affine.toastMessage.removedFavorites']()
  //         : t['com.affine.toastMessage.addedFavorites']()
  //     );
  //   }, [tag.id, favAdapter, isFavorite, t]);

  //   return (
  //     <FavoriteTag
  //       style={{ marginRight: 8 }}
  //       onClick={onToggleFavoriteCollection}
  //       active={isFavorite}
  //     />
  //   );

  return null;
};

export const SelectTag = ({
  init = [],
  onConfirm,
  onCancel,
}: BaseSelectorDialogProps<string[]>) => {
  const t = useI18n();

  const workspace = useService(WorkspaceService).workspace;
  const tagList = useService(TagService).tagList;

  const [selection, setSelection] = useState(init);
  const [keyword, setKeyword] = useState('');
  const tagMetas: TagMeta[] = useLiveData(tagList.tagMetas$);

  const filteredTagMetas = useMemo(() => {
    return tagMetas.filter(tag => {
      const reg = new RegExp(keyword, 'i');
      return reg.test(tag.title);
    });
  }, [keyword, tagMetas]);

  const tagItemRenderer = useCallback((item: ListItem) => {
    return <TagListItemRenderer {...item} />;
  }, []);

  const tagOperationRenderer = useCallback((item: ListItem) => {
    return <FavoriteOperation tag={item} />;
  }, []);

  const tagHeaderRenderer = useCallback(() => {
    return <ListTableHeader headerCols={tagHeaderColsDef} />;
  }, []);

  return (
    <SelectorLayout
      searchPlaceholder={t['com.affine.selector-tag.search.placeholder']()}
      selectedCount={selection.length}
      onSearch={setKeyword}
      onConfirm={() => onConfirm?.(selection)}
      onCancel={onCancel}
      onClear={() => setSelection([])}
    >
      <VirtualizedList
        selectable={true}
        draggable={false}
        selectedIds={selection}
        onSelectedIdsChange={setSelection}
        items={filteredTagMetas}
        docCollection={workspace.docCollection}
        itemRenderer={tagItemRenderer}
        operationsRenderer={tagOperationRenderer}
        headerRenderer={tagHeaderRenderer}
      />
    </SelectorLayout>
  );
};
