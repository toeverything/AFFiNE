import { toast } from '@affine/component';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { Tag } from '@blocksuite/store';
import { useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
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
  const t = useAFFiNEI18N();
  const listRef = useRef<ItemListHandle>(null);
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);
  const [showCreateTagInput, setShowCreateTagInput] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const currentWorkspace = useService(Workspace);

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
    onTagDelete(selectedTagIds);
    toast(t['com.affine.delete-tags.count']({ count: selectedTagIds.length }));
    hideFloatingToolbar();
    return;
  }, [hideFloatingToolbar, onTagDelete, selectedTagIds, t]);

  const onOpenCreate = useCallback(() => {
    setShowCreateTagInput(true);
  }, [setShowCreateTagInput]);

  return (
    <>
      <VirtualizedList
        ref={listRef}
        selectable="toggle"
        draggable={false}
        groupBy={false}
        atTopThreshold={80}
        onSelectionActiveChange={setShowFloatingToolbar}
        heading={<TagListHeader onOpen={onOpenCreate} />}
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
