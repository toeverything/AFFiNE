import { PropertyValue } from '@affine/component';
import { type TagLike, TagsInlineEditor } from '@affine/component/ui/tags';
import { TagService } from '@affine/core/modules/tag';
import type { DatabaseBlockDataSource } from '@blocksuite/affine/blocks';
import type { SelectTag } from '@blocksuite/data-view';
import { useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback, useMemo } from 'react';

import type {
  DatabaseCellRendererProps,
  DatabaseValueCell,
} from '../../../types';
import * as styles from './select.css';

const adapter = {
  getSelectedIds(cell: DatabaseValueCell): string[] {
    const ids = cell.value as string[];
    if (!Array.isArray(ids)) {
      return typeof ids === 'string' ? [ids] : [];
    }
    return ids.filter(id => typeof id === 'string');
  },

  getSelectedTags(cell: DatabaseValueCell): TagLike[] {
    const ids = adapter.getSelectedIds(cell);
    const options = adapter.getTagOptions(cell);
    return ids
      .map(
        id => typeof id === 'string' && options.find(option => option.id === id)
      )
      .filter(option => !!option)
      .map(option => ({
        id: option.id,
        value: option.value,
        color: option.color,
      }));
  },

  getTagOptions(cell: DatabaseValueCell) {
    const data = cell.property.additionalData;
    const candidates = data.options as SelectTag[];
    return candidates;
  },

  updateOptions(
    cell: DatabaseValueCell,
    dataSource: DatabaseBlockDataSource,
    updater: (oldOptions: SelectTag[]) => SelectTag[]
  ) {
    const oldData = dataSource.propertyDataGet(cell.property.id);
    return dataSource.propertyDataSet(cell.property.id, {
      ...oldData,
      options: updater(oldData.options as SelectTag[]),
    });
  },

  deselectTag(
    rowId: string,
    cell: DatabaseValueCell,
    dataSource: DatabaseBlockDataSource,
    tagId: string,
    multiple: boolean
  ) {
    const ids = adapter.getSelectedIds(cell);
    dataSource.cellValueChange(
      rowId,
      cell.property.id,
      multiple ? ids.filter(id => id !== tagId) : undefined
    );
  },

  selectTag(
    rowId: string,
    cell: DatabaseValueCell,
    dataSource: DatabaseBlockDataSource,
    tagId: string,
    multiple: boolean
  ) {
    const ids = adapter.getSelectedIds(cell);
    dataSource.cellValueChange(
      rowId,
      cell.property.id,
      multiple ? [...ids, tagId] : tagId
    );
  },

  createTag(
    cell: DatabaseValueCell,
    dataSource: DatabaseBlockDataSource,
    newTag: TagLike
  ) {
    adapter.updateOptions(cell, dataSource, options => [
      ...options,
      {
        id: newTag.id,
        value: newTag.value,
        color: newTag.color,
      },
    ]);
  },

  deleteTag(
    cell: DatabaseValueCell,
    dataSource: DatabaseBlockDataSource,
    tagId: string
  ) {
    adapter.updateOptions(cell, dataSource, options =>
      options.filter(option => option.id !== tagId)
    );
  },

  updateTag(
    cell: DatabaseValueCell,
    dataSource: DatabaseBlockDataSource,
    tagId: string,
    updater: (oldTag: SelectTag) => SelectTag
  ) {
    adapter.updateOptions(cell, dataSource, options =>
      options.map(option => (option.id === tagId ? updater(option) : option))
    );
  },
};

const BlocksuiteDatabaseSelector = ({
  cell,
  dataSource,
  rowId,
  multiple,
}: DatabaseCellRendererProps & { multiple: boolean }) => {
  const tagService = useService(TagService);

  const selectedIds = useMemo(() => {
    return adapter.getSelectedIds(cell);
  }, [cell]);

  const tagOptions = useMemo(() => {
    return adapter.getTagOptions(cell);
  }, [cell]);

  const onCreateTag = useCallback(
    (name: string, color: string) => {
      const newTag = {
        id: nanoid(),
        value: name,
        color,
      };
      adapter.createTag(cell, dataSource, newTag);
      return newTag;
    },
    [cell, dataSource]
  );
  const onDeleteTag = useCallback(
    (tagId: string) => {
      adapter.deleteTag(cell, dataSource, tagId);
    },
    [cell, dataSource]
  );
  const onDeselectTag = useCallback(
    (tagId: string) => {
      adapter.deselectTag(rowId, cell, dataSource, tagId, multiple);
    },
    [cell, dataSource, rowId, multiple]
  );

  const onSelectTag = useCallback(
    (tagId: string) => {
      adapter.selectTag(rowId, cell, dataSource, tagId, multiple);
    },
    [cell, dataSource, rowId, multiple]
  );

  const tagColors = useMemo(() => {
    return tagService.tagColors.map(([name, color]) => ({
      id: name,
      value: color,
      name,
    }));
  }, [tagService.tagColors]);

  const onTagChange = useCallback(
    (tagId: string, property: string, value: string) => {
      adapter.updateTag(cell, dataSource, tagId, old => {
        return {
          ...old,
          [property]: value,
        };
      });
    },
    [cell, dataSource]
  );

  return (
    <TagsInlineEditor
      className={styles.tagInlineEditor}
      tags={tagOptions}
      selectedTags={selectedIds}
      onCreateTag={onCreateTag}
      onDeleteTag={onDeleteTag}
      onDeselectTag={onDeselectTag}
      onSelectTag={onSelectTag}
      tagColors={tagColors}
      onTagChange={onTagChange}
    />
  );
};

export const SelectCell = ({
  cell,
  dataSource,
  rowId,
}: DatabaseCellRendererProps) => {
  const isEmpty = Array.isArray(cell.value) && cell.value.length === 0;
  return (
    <PropertyValue isEmpty={isEmpty} className={styles.container}>
      <BlocksuiteDatabaseSelector
        cell={cell}
        dataSource={dataSource}
        rowId={rowId}
        multiple={false}
      />
    </PropertyValue>
  );
};

export const MultiSelectCell = ({
  cell,
  dataSource,
  rowId,
}: DatabaseCellRendererProps) => {
  const isEmpty = Array.isArray(cell.value) && cell.value.length === 0;
  return (
    <PropertyValue isEmpty={isEmpty} className={styles.container}>
      <BlocksuiteDatabaseSelector
        cell={cell}
        dataSource={dataSource}
        rowId={rowId}
        multiple={true}
      />
    </PropertyValue>
  );
};
