/* eslint-disable rxjs/finnish */

import { PropertyValue } from '@affine/component';
import { type TagLike, TagsInlineEditor } from '@affine/core/components/tags';
import { TagService } from '@affine/core/modules/tag';
import {
  affineLabelToDatabaseTagColor,
  databaseTagColorToV2,
} from '@affine/core/modules/tag/entities/utils';
import type { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import type { SelectTag } from '@blocksuite/data-view';
import { MultiSelectIcon, SingleSelectIcon } from '@blocksuite/icons/rc';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback, useMemo } from 'react';

import type {
  DatabaseCellRendererProps,
  DatabaseValueCell,
} from '../../../types';
import * as styles from './select.css';

interface SelectPropertyData {
  options: SelectTag[];
}

type SelectCellValue = string[] | string;

type SelectCell<T extends SelectCellValue> = DatabaseValueCell<
  T,
  SelectPropertyData
>;

type SingleSelectCell = SelectCell<string>;
type MultiSelectCell = SelectCell<string[]>;

const adapter = {
  getSelectedIds$(cell: SingleSelectCell | MultiSelectCell) {
    return cell.value$.map(ids => {
      if (!Array.isArray(ids)) {
        return typeof ids === 'string' ? [ids] : [];
      }
      return ids.filter(id => typeof id === 'string');
    });
  },

  getSelectedTags$(cell: SingleSelectCell | MultiSelectCell) {
    return LiveData.computed(get => {
      const ids = get(adapter.getSelectedIds$(cell));
      const options = get(adapter.getTagOptions$(cell));
      return ids
        .map(
          id =>
            typeof id === 'string' && options.find(option => option.id === id)
        )
        .filter(option => !!option);
    });
  },

  getTagOptions$(cell: SingleSelectCell | MultiSelectCell) {
    return LiveData.computed(get => {
      const data = get(cell.property.data$);
      return data?.options as SelectTag[];
    });
  },

  updateOptions(
    cell: SingleSelectCell | MultiSelectCell,
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
    cell: SingleSelectCell | MultiSelectCell,
    dataSource: DatabaseBlockDataSource,
    tagId: string,
    multiple: boolean
  ) {
    const ids = adapter.getSelectedIds$(cell).value;
    dataSource.cellValueChange(
      rowId,
      cell.property.id,
      multiple ? ids.filter(id => id !== tagId) : undefined
    );
  },

  selectTag(
    rowId: string,
    cell: SingleSelectCell | MultiSelectCell,
    dataSource: DatabaseBlockDataSource,
    tagId: string,
    multiple: boolean
  ) {
    const ids = adapter.getSelectedIds$(cell).value;
    dataSource.cellValueChange(
      rowId,
      cell.property.id,
      multiple ? [...ids, tagId] : tagId
    );
  },

  createTag(
    cell: SingleSelectCell | MultiSelectCell,
    dataSource: DatabaseBlockDataSource,
    newTag: TagLike
  ) {
    adapter.updateOptions(cell, dataSource, options => [
      ...options,
      {
        id: newTag.id,
        value: newTag.name,
        color: newTag.color,
      },
    ]);
  },

  deleteTag(
    cell: SingleSelectCell | MultiSelectCell,
    dataSource: DatabaseBlockDataSource,
    tagId: string
  ) {
    adapter.updateOptions(cell, dataSource, options =>
      options.filter(option => option.id !== tagId)
    );
  },

  updateTag(
    cell: SingleSelectCell | MultiSelectCell,
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
  onChange,
}: DatabaseCellRendererProps & { multiple: boolean }) => {
  const tagService = useService(TagService);
  const selectCell = cell as any as SingleSelectCell | MultiSelectCell;
  const selectedIds = useLiveData(adapter.getSelectedIds$(selectCell));
  let tagOptions = useLiveData(adapter.getTagOptions$(selectCell));

  // adapt bs database old tag color to new tag color
  let adaptedTagOptions = useMemo(() => {
    return tagOptions.map(tag => ({
      id: tag.id,
      name: tag.value,
      color: databaseTagColorToV2(tag.color),
    }));
  }, [tagOptions]);

  const onCreateTag = useCallback(
    (name: string, color: string) => {
      // bs database uses --affine-tag-xxx colors
      const newTag = {
        id: nanoid(),
        name: name,
        color: color,
      };
      adapter.createTag(selectCell, dataSource, newTag);
      return newTag;
    },
    [dataSource, selectCell]
  );
  const onDeleteTag = useCallback(
    (tagId: string) => {
      adapter.deleteTag(selectCell, dataSource, tagId);
      onChange?.(selectCell.value$.value);
    },
    [dataSource, selectCell, onChange]
  );
  const onDeselectTag = useCallback(
    (tagId: string) => {
      adapter.deselectTag(rowId, selectCell, dataSource, tagId, multiple);
      onChange?.(selectCell.value$.value);
    },
    [rowId, selectCell, dataSource, multiple, onChange]
  );

  const onSelectTag = useCallback(
    (tagId: string) => {
      adapter.selectTag(rowId, selectCell, dataSource, tagId, multiple);
      onChange?.(selectCell.value$.value);
    },
    [rowId, selectCell, dataSource, multiple, onChange]
  );

  const tagColors = useMemo(() => {
    return tagService.tagColors.map(([name, color]) => ({
      id: name,
      value: affineLabelToDatabaseTagColor(color),
      name,
    }));
  }, [tagService.tagColors]);

  const onTagChange = useCallback(
    (tagId: string, property: string, value: string) => {
      adapter.updateTag(selectCell, dataSource, tagId, old => {
        if (property === 'color') {
          value = affineLabelToDatabaseTagColor(value);
        }
        return {
          ...old,
          [property]: value,
        };
      });
    },
    [dataSource, selectCell]
  );

  const propertyName = useLiveData(cell.property.name$);

  return (
    <TagsInlineEditor
      tagMode="db-label"
      className={styles.tagInlineEditor}
      tags={adaptedTagOptions}
      selectedTags={selectedIds}
      onCreateTag={onCreateTag}
      onDeleteTag={onDeleteTag}
      onDeselectTag={onDeselectTag}
      onSelectTag={onSelectTag}
      tagColors={tagColors}
      onTagChange={onTagChange}
      title={
        <>
          {multiple ? <MultiSelectIcon /> : <SingleSelectIcon />}
          {propertyName}
        </>
      }
    />
  );
};

export const SelectCell = ({
  cell,
  dataSource,
  rowId,
  onChange,
}: DatabaseCellRendererProps) => {
  const isEmpty = useLiveData(
    cell.value$.map(value => Array.isArray(value) && value.length === 0)
  );
  return (
    <PropertyValue isEmpty={isEmpty} className={styles.container}>
      <BlocksuiteDatabaseSelector
        cell={cell}
        dataSource={dataSource}
        rowId={rowId}
        multiple={false}
        onChange={onChange}
      />
    </PropertyValue>
  );
};

export const MultiSelectCell = ({
  cell,
  dataSource,
  rowId,
  onChange,
}: DatabaseCellRendererProps) => {
  const isEmpty = useLiveData(
    cell.value$.map(value => Array.isArray(value) && value.length === 0)
  );
  return (
    <PropertyValue isEmpty={isEmpty} className={styles.container}>
      <BlocksuiteDatabaseSelector
        cell={cell}
        dataSource={dataSource}
        rowId={rowId}
        multiple={true}
        onChange={onChange}
      />
    </PropertyValue>
  );
};
