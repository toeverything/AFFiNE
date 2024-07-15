import type { Tag } from '@affine/core/modules/tag';
import { Trans } from '@affine/i18n';
import { useService, WorkspaceService } from '@toeverything/infra';
import { useCallback, useMemo, useRef, useState } from 'react';

import { ListFloatingToolbar } from '../components/list-floating-toolbar';
import { tagHeaderColsDef } from '../header-col-def';
import { TagOperationCell } from '../operation-cell';
import { TagListItemRenderer } from '../page-group';
import { ListTableHeader } from '../page-header';
import type { ItemListHandle, ListItem, TagMeta } from '../types';
import { VirtualizedList } from '../virtualized-list';
import { CreateOrEditTag } from './create-tag';
import { TagListHeader } from './tag-list-header';

export const VirtualizedTagList = ({
  tags,
  tagMetas,
  onTagDelete,
}: {
  tags: Tag[];
  tagMetas: TagMeta[];
  onTagDelete: (tagIds: string[]) => void;
}) => {
  const listRef = useRef<ItemListHandle>(null);
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);
  const [showCreateTagInput, setShowCreateTagInput] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const currentWorkspace = useService(WorkspaceService).workspace;

  const tagOperations = useCallback(
    (tag: TagMeta) => {
      return <TagOperationCell tag={tag} onTagDelete={onTagDelete} />;
    },
    [onTagDelete]
  );

  const filteredSelectedTagIds = useMemo(() => {
    const ids = tags.map(tag => tag.id);
    return selectedTagIds.filter(id => ids.includes(id));
  }, [selectedTagIds, tags]);

  const hideFloatingToolbar = useCallback(() => {
    listRef.current?.toggleSelectable();
  }, []);

  const tagOperationRenderer = useCallback(
    (item: ListItem) => {
      const tag = item as TagMeta;
      return tagOperations(tag);
    },
    [tagOperations]
  );

  const tagHeaderRenderer = useCallback(() => {
    return (
      <>
        <ListTableHeader headerCols={tagHeaderColsDef} />
        <CreateOrEditTag
          open={showCreateTagInput}
          onOpenChange={setShowCreateTagInput}
        />
      </>
    );
  }, [showCreateTagInput]);

  const tagItemRenderer = useCallback((item: ListItem) => {
    return <TagListItemRenderer {...item} />;
  }, []);

  const handleDelete = useCallback(() => {
    if (selectedTagIds.length === 0) {
      return;
    }
    onTagDelete(selectedTagIds);
    hideFloatingToolbar();
    return;
  }, [hideFloatingToolbar, onTagDelete, selectedTagIds]);

  const onOpenCreate = useCallback(() => {
    setShowCreateTagInput(true);
  }, [setShowCreateTagInput]);

  return (
    <>
      <VirtualizedList
        ref={listRef}
        selectable="toggle"
        draggable={true}
        atTopThreshold={80}
        onSelectionActiveChange={setShowFloatingToolbar}
        heading={<TagListHeader onOpen={onOpenCreate} />}
        selectedIds={filteredSelectedTagIds}
        onSelectedIdsChange={setSelectedTagIds}
        items={tagMetas}
        itemRenderer={tagItemRenderer}
        rowAsLink
        docCollection={currentWorkspace.docCollection}
        operationsRenderer={tagOperationRenderer}
        headerRenderer={tagHeaderRenderer}
      />
      <ListFloatingToolbar
        open={showFloatingToolbar}
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
