import { Checkbox } from '@affine/component';
import { getDNDId } from '@affine/core/hooks/affine/use-global-dnd-helper';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { useDraggable } from '@dnd-kit/core';
import type { PropsWithChildren } from 'react';
import { useCallback, useMemo } from 'react';

import { selectionStateAtom, useAtom } from '../scoped-atoms';
import type {
  CollectionListItemProps,
  DraggableTitleCellData,
  PageListItemProps,
} from '../types';
import { ColWrapper, stopPropagation } from '../utils';
import * as styles from './collection-list-item.css';

const ListTitleCell = ({
  title,
  preview,
}: Pick<PageListItemProps, 'title' | 'preview'>) => {
  const t = useI18n();
  return (
    <div data-testid="page-list-item-title" className={styles.titleCell}>
      <div
        data-testid="page-list-item-title-text"
        className={styles.titleCellMain}
      >
        {title || t['Untitled']()}
      </div>
      {preview ? (
        <div
          data-testid="page-list-item-preview-text"
          className={styles.titleCellPreview}
        >
          {preview}
        </div>
      ) : null}
    </div>
  );
};

const ListIconCell = ({ icon }: Pick<PageListItemProps, 'icon'>) => {
  return (
    <div data-testid="page-list-item-icon" className={styles.iconCell}>
      {icon}
    </div>
  );
};

const CollectionSelectionCell = ({
  selectable,
  onSelectedChange,
  selected,
}: Pick<
  CollectionListItemProps,
  'selectable' | 'onSelectedChange' | 'selected'
>) => {
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

const CollectionListOperationsCell = ({
  operations,
}: Pick<CollectionListItemProps, 'operations'>) => {
  return operations ? (
    <div onClick={stopPropagation} className={styles.operationsCell}>
      {operations}
    </div>
  ) : null;
};

export const CollectionListItem = (props: CollectionListItemProps) => {
  const collectionTitleElement = useMemo(() => {
    return (
      <div className={styles.dragPageItemOverlay}>
        <div className={styles.titleIconsWrapper}>
          <CollectionSelectionCell
            onSelectedChange={props.onSelectedChange}
            selectable={props.selectable}
            selected={props.selected}
          />
          <ListIconCell icon={props.icon} />
        </div>
        <ListTitleCell title={props.title} />
      </div>
    );
  }, [
    props.icon,
    props.onSelectedChange,
    props.selectable,
    props.selected,
    props.title,
  ]);

  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: getDNDId('collection-list', 'collection', props.collectionId),
    data: {
      preview: collectionTitleElement,
    } satisfies DraggableTitleCellData,
    disabled: !props.draggable,
  });

  return (
    <CollectionListItemWrapper
      onClick={props.onClick}
      to={props.to}
      collectionId={props.collectionId}
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
            <CollectionSelectionCell
              onSelectedChange={props.onSelectedChange}
              selectable={props.selectable}
              selected={props.selected}
            />
            <ListIconCell icon={props.icon} />
          </div>
          <ListTitleCell title={props.title} />
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
          flex={3}
          alignment="end"
        >
          <CollectionListOperationsCell operations={props.operations} />
        </ColWrapper>
      ) : null}
    </CollectionListItemWrapper>
  );
};

type collectionListWrapperProps = PropsWithChildren<
  Pick<
    CollectionListItemProps,
    'to' | 'collectionId' | 'onClick' | 'draggable'
  > & {
    isDragging: boolean;
  }
>;

function CollectionListItemWrapper({
  to,
  isDragging,
  collectionId,
  onClick,
  children,
  draggable,
}: collectionListWrapperProps) {
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
      'data-testid': 'collection-list-item',
      'data-collection-id': collectionId,
      'data-draggable': draggable,
      className: styles.root,
      'data-clickable': !!onClick || !!to,
      'data-dragging': isDragging,
      onClick: handleClick,
    }),
    [collectionId, draggable, isDragging, onClick, to, handleClick]
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
