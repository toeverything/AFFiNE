import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useDraggable } from '@dnd-kit/core';
import { type PropsWithChildren, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Checkbox } from '../../ui/checkbox';
import * as styles from './page-list-item.css';
import { PageTags } from './page-tags';
import type { DraggableTitleCellData, PageListItemProps } from './types';
import { ColWrapper, formatDate, stopPropagation } from './utils';

const PageListTitleCell = ({
  title,
  preview,
}: Pick<PageListItemProps, 'title' | 'preview'>) => {
  const t = useAFFiNEI18N();
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

const PageListIconCell = ({ icon }: Pick<PageListItemProps, 'icon'>) => {
  return (
    <div data-testid="page-list-item-icon" className={styles.iconCell}>
      {icon}
    </div>
  );
};

const PageSelectionCell = ({
  selectable,
  onSelectedChange,
  selected,
}: Pick<PageListItemProps, 'selectable' | 'onSelectedChange' | 'selected'>) => {
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

export const PageTagsCell = ({ tags }: Pick<PageListItemProps, 'tags'>) => {
  return (
    <div data-testid="page-list-item-tags" className={styles.tagsCell}>
      <PageTags
        tags={tags}
        hoverExpandDirection="left"
        widthOnHover="300%"
        maxItems={5}
      />
    </div>
  );
};

const PageCreateDateCell = ({
  createDate,
}: Pick<PageListItemProps, 'createDate'>) => {
  return (
    <div
      data-testid="page-list-item-date"
      data-date-raw={createDate}
      className={styles.dateCell}
    >
      {formatDate(createDate)}
    </div>
  );
};

const PageUpdatedDateCell = ({
  updatedDate,
}: Pick<PageListItemProps, 'updatedDate'>) => {
  return (
    <div
      data-testid="page-list-item-date"
      data-date-raw={updatedDate}
      className={styles.dateCell}
    >
      {updatedDate ? formatDate(updatedDate) : '-'}
    </div>
  );
};

const PageListOperationsCell = ({
  operations,
}: Pick<PageListItemProps, 'operations'>) => {
  return operations ? (
    <div onClick={stopPropagation} className={styles.operationsCell}>
      {operations}
    </div>
  ) : null;
};

export const PageListItem = (props: PageListItemProps) => {
  const pageTitleElement = useMemo(() => {
    return (
      <>
        <div className={styles.titleIconsWrapper}>
          <PageSelectionCell
            onSelectedChange={props.onSelectedChange}
            selectable={props.selectable}
            selected={props.selected}
          />
          <PageListIconCell icon={props.icon} />
        </div>
        <PageListTitleCell title={props.title} preview={props.preview} />
      </>
    );
  }, [
    props.icon,
    props.onSelectedChange,
    props.preview,
    props.selectable,
    props.selected,
    props.title,
  ]);

  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: 'page-list-item-title-' + props.pageId,
    data: {
      pageId: props.pageId,
      pageTitle: pageTitleElement,
    } satisfies DraggableTitleCellData,
    disabled: !props.draggable,
  });

  return (
    <PageListItemWrapper
      onClick={props.onClick}
      to={props.to}
      pageId={props.pageId}
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
            <PageSelectionCell
              onSelectedChange={props.onSelectedChange}
              selectable={props.selectable}
              selected={props.selected}
            />
            <PageListIconCell icon={props.icon} />
          </div>
          <PageListTitleCell title={props.title} preview={props.preview} />
        </ColWrapper>
        <ColWrapper flex={4} alignment="end" style={{ overflow: 'visible' }}>
          <PageTagsCell tags={props.tags} />
        </ColWrapper>
      </ColWrapper>
      <ColWrapper flex={1} alignment="end" hideInSmallContainer>
        <PageCreateDateCell createDate={props.createDate} />
      </ColWrapper>
      <ColWrapper flex={1} alignment="end" hideInSmallContainer>
        <PageUpdatedDateCell updatedDate={props.updatedDate} />
      </ColWrapper>
      {props.operations ? (
        <ColWrapper
          className={styles.actionsCellWrapper}
          flex={1}
          alignment="end"
        >
          <PageListOperationsCell operations={props.operations} />
        </ColWrapper>
      ) : null}
    </PageListItemWrapper>
  );
};

type PageListWrapperProps = PropsWithChildren<
  Pick<PageListItemProps, 'to' | 'pageId' | 'onClick' | 'draggable'> & {
    isDragging: boolean;
  }
>;

function PageListItemWrapper({
  to,
  isDragging,
  pageId,
  onClick,
  children,
  draggable,
}: PageListWrapperProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (onClick) {
        stopPropagation(e);
        onClick();
      }
    },
    [onClick]
  );

  const commonProps = useMemo(
    () => ({
      'data-testid': 'page-list-item',
      'data-page-id': pageId,
      'data-draggable': draggable,
      className: styles.root,
      'data-clickable': !!onClick || !!to,
      'data-dragging': isDragging,
      onClick: handleClick,
    }),
    [pageId, draggable, isDragging, onClick, to, handleClick]
  );

  if (to) {
    return (
      <Link {...commonProps} to={to}>
        {children}
      </Link>
    );
  } else {
    return <div {...commonProps}>{children}</div>;
  }
}

export const PageListDragOverlay = ({
  children,
  over,
}: PropsWithChildren<{
  over?: boolean;
}>) => {
  return (
    <div data-over={over} className={styles.dragOverlay}>
      {children}
    </div>
  );
};
