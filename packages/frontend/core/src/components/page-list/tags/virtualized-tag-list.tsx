import { Trans } from '@affine/i18n';
import type { Tag } from '@blocksuite/store';
import { useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
import { useCallback, useMemo, useRef, useState } from 'react';

import { ListFloatingToolbar } from '../components/list-floating-toolbar';
import { tagHeaderColsDef } from '../header-col-def';
import { TagListItemRenderer } from '../page-group';
import { ListTableHeader } from '../page-header';
import type { ItemListHandle, ListItem, TagMeta } from '../types';
import { VirtualizedList } from '../virtualized-list';
import { TagListHeader } from './tag-list-header';

export const VirtualizedTagList = ({
  tags,
  tagMetas,
  setHideHeaderCreateNewTag,
  onTagDelete,
}: {
  tags: Tag[];
  tagMetas: TagMeta[];
  setHideHeaderCreateNewTag: (hide: boolean) => void;
  onTagDelete: (tagIds: string[]) => void;
}) => {
  const listRef = useRef<ItemListHandle>(null);
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const currentWorkspace = useService(Workspace);

  const filteredSelectedTagIds = useMemo(() => {
    const ids = tags.map(tag => tag.id);
    return selectedTagIds.filter(id => ids.includes(id));
  }, [selectedTagIds, tags]);

  const hideFloatingToolbar = useCallback(() => {
    listRef.current?.toggleSelectable();
  }, []);

  const tagOperationRenderer = useCallback(() => {
    return null;
  }, []);

  const tagHeaderRenderer = useCallback(() => {
    return <ListTableHeader headerCols={tagHeaderColsDef} />;
  }, []);

  const tagItemRenderer = useCallback((item: ListItem) => {
    return <TagListItemRenderer {...item} />;
  }, []);

  const handleDelete = useCallback(() => {
    onTagDelete(selectedTagIds);
    hideFloatingToolbar();
    return;
  }, [hideFloatingToolbar, onTagDelete, selectedTagIds]);

  return (
    <>
      <VirtualizedList
        ref={listRef}
        selectable={false}
        draggable={false}
        groupBy={false}
        atTopThreshold={80}
        atTopStateChange={setHideHeaderCreateNewTag}
        onSelectionActiveChange={setShowFloatingToolbar}
        heading={<TagListHeader />}
        selectedIds={filteredSelectedTagIds}
        onSelectedIdsChange={setSelectedTagIds}
        items={tagMetas}
        itemRenderer={tagItemRenderer}
        rowAsLink
        blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        operationsRenderer={tagOperationRenderer}
        headerRenderer={tagHeaderRenderer}
      />
      <ListFloatingToolbar
        open={showFloatingToolbar && selectedTagIds.length > 0}
        content={
          <Trans
            i18nKey="com.affine.tag.toolbar.selected"
            count={selectedTagIds.length}
          >
            <div style={{ color: 'var(--affine-text-secondary-color)' }}>
              {{ count: selectedTagIds.length } as any}
            </div>
            selected
          </Trans>
        }
        onClose={hideFloatingToolbar}
        onDelete={handleDelete}
      />
    </>
  );
};
