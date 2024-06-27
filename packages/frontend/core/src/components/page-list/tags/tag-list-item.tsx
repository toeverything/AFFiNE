import { Checkbox } from '@affine/component';
import { getDNDId } from '@affine/core/hooks/affine/use-global-dnd-helper';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { useDraggable } from '@dnd-kit/core';
import type { PropsWithChildren } from 'react';
import { useCallback, useMemo } from 'react';

import { selectionStateAtom, useAtom } from '../scoped-atoms';
import type { DraggableTitleCellData, TagListItemProps } from '../types';
import { ColWrapper, stopPropagation } from '../utils';
import * as styles from './tag-list-item.css';

const TagListTitleCell = ({
  title,
  pageCount,
}: Pick<TagListItemProps, 'title' | 'pageCount'>) => {
  const t = useI18n();
  return (
    <div data-testid="tag-list-item-title" className={styles.titleCell}>
      <div
        data-testid="tag-list-item-title-text"
        className={styles.titleCellMain}
      >
        {title || t['Untitled']()}
      </div>
      <div
        data-testid="page-list-item-preview-text"
        className={styles.titleCellPreview}
      >
        {` · ${t['com.affine.tags.count']({ count: pageCount || 0 })}`}
      </div>
    </div>
  );
};

const ListIconCell = ({ color }: Pick<TagListItemProps, 'color'>) => {
  return (
    <div className={styles.tagIndicatorWrapper}>
      <div
        className={styles.tagIndicator}
        style={{
          backgroundColor: color,
        }}
      />
    </div>
  );
};

const TagSelectionCell = ({
  selectable,
  onSelectedChange,
  selected,
}: Pick<TagListItemProps, 'selectable' | 'onSelectedChange' | 'selected'>) => {
  const onSelectionChange = useCallback(
    (_event: React.ChangeEvent<HTMLInputElement>) => {
      return onSelectedChange?.();
    },
    [onSelectedChange]
  );
  if (!selectable) {
    return null;
  }
  return (
    <div className={styles.selectionCell}>
      <Checkbox
        onClick={stopPropagation}
        checked={!!selected}
        onChange={onSelectionChange}
      />
    </div>
  );
};

const TagListOperationsCell = ({
  operations,
}: Pick<TagListItemProps, 'operations'>) => {
  return operations ? (
    <div onClick={stopPropagation} className={styles.operationsCell}>
      {operations}
    </div>
  ) : null;
};

export const TagListItem = (props: TagListItemProps) => {
  const tagTitleElement = useMemo(() => {
    return (
      <div className={styles.dragPageItemOverlay}>
        <div className={styles.titleIconsWrapper}>
          <TagSelectionCell
            onSelectedChange={props.onSelectedChange}
            selectable={props.selectable}
            selected={props.selected}
          />
          <ListIconCell color={props.color} />
        </div>
      </div>
    );
  }, [props.color, props.onSelectedChange, props.selectable, props.selected]);

  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: getDNDId('tag-list', 'tag', props.tagId),
    data: {
      preview: tagTitleElement,
    } satisfies DraggableTitleCellData,
    disabled: !props.draggable,
  });

  return (
    <TagListItemWrapper
      onClick={props.onClick}
      to={props.to}
      tagId={props.tagId}
      draggable={props.draggable}
      isDragging={isDragging}
    >
      <ColWrapper flex={9}>
        <ColWrapper
          className={styles.dndCell}
          flex={8}
          ref={setNodeRef}
          {...attributes}
          {...listeners}
        >
          <div className={styles.titleIconsWrapper}>
            <TagSelectionCell
              onSelectedChange={props.onSelectedChange}
              selectable={props.selectable}
              selected={props.selected}
            />
            <ListIconCell color={props.color} />
          </div>
          <TagListTitleCell title={props.title} pageCount={props.pageCount} />
        </ColWrapper>
        <ColWrapper
          flex={4}
          alignment="end"
          style={{ overflow: 'visible' }}
        ></ColWrapper>
      </ColWrapper>
      {props.operations ? (
        <ColWrapper
          className={styles.actionsCellWrapper}
          flex={2}
          alignment="end"
        >
          <TagListOperationsCell operations={props.operations} />
        </ColWrapper>
      ) : null}
    </TagListItemWrapper>
  );
};

type TagListWrapperProps = PropsWithChildren<
  Pick<TagListItemProps, 'to' | 'tagId' | 'onClick' | 'draggable'> & {
    isDragging: boolean;
  }
>;

function TagListItemWrapper({
  to,
  isDragging,
  tagId,
  onClick,
  children,
  draggable,
}: TagListWrapperProps) {
  const [selectionState, setSelectionActive] = useAtom(selectionStateAtom);
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!selectionState.selectable) {
        return;
      }
      if (e.shiftKey) {
        stopPropagation(e);
        setSelectionActive(true);
        onClick?.();
        return;
      }
      if (selectionState.selectionActive) {
        return onClick?.();
      }
    },
    [
      onClick,
      selectionState.selectable,
      selectionState.selectionActive,
      setSelectionActive,
    ]
  );

  const commonProps = useMemo(
    () => ({
      'data-testid': 'tag-list-item',
      'data-tag-id': tagId,
      'data-draggable': draggable,
      className: styles.root,
      'data-clickable': !!onClick || !!to,
      'data-dragging': isDragging,
      onClick: handleClick,
    }),
    [tagId, draggable, isDragging, onClick, to, handleClick]
  );

  if (to) {
    return (
      <WorkbenchLink {...commonProps} to={to}>
        {children}
      </WorkbenchLink>
    );
  } else {
    return <div {...commonProps}>{children}</div>;
  }
}
