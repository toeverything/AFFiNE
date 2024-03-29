import { Checkbox } from '@affine/component';
import { TagService } from '@affine/core/modules/tag';
import { useDraggable } from '@dnd-kit/core';
import { useLiveData, useService } from '@toeverything/infra';
import type { PropsWithChildren } from 'react';
import { useCallback, useMemo } from 'react';

import { WorkbenchLink } from '../../../modules/workbench/view/workbench-link';
import { selectionStateAtom, useAtom } from '../scoped-atoms';
import type { DraggableTitleCellData, PageListItemProps } from '../types';
import { usePageDisplayProperties } from '../use-page-display-properties';
import { ColWrapper, formatDate, stopPropagation } from '../utils';
import * as styles from './page-list-item.css';
import { PageTags } from './page-tags';

const ListTitleCell = ({
  title,
  preview,
}: Pick<PageListItemProps, 'title' | 'preview'>) => {
  const [displayProperties] = usePageDisplayProperties();
  return (
    <div data-testid="page-list-item-title" className={styles.titleCell}>
      <div
        data-testid="page-list-item-title-text"
        className={styles.titleCellMain}
      >
        {title}
      </div>
      {preview && displayProperties['bodyNotes'] ? (
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

export const PageTagsCell = ({ pageId }: Pick<PageListItemProps, 'pageId'>) => {
  const tagsService = useService(TagService);
  const tags = useLiveData(tagsService.tagsByPageId$(pageId));

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
  const [displayProperties] = usePageDisplayProperties();
  const pageTitleElement = useMemo(() => {
    return (
      <div className={styles.dragPageItemOverlay}>
        <div className={styles.titleIconsWrapper}>
          <PageSelectionCell
            onSelectedChange={props.onSelectedChange}
            selectable={props.selectable}
            selected={props.selected}
          />
          <ListIconCell icon={props.icon} />
        </div>
        <ListTitleCell title={props.title} preview={props.preview} />
      </div>
    );
  }, [
    props.icon,
    props.onSelectedChange,
    props.preview,
    props.selectable,
    props.selected,
    props.title,
  ]);

  // TODO: use getDropItemId
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
            <ListIconCell icon={props.icon} />
          </div>
          <ListTitleCell title={props.title} preview={props.preview} />
        </ColWrapper>
        <ColWrapper
          flex={4}
          alignment="end"
          style={{ overflow: 'visible' }}
          hidden={!displayProperties['tags']}
        >
          <PageTagsCell pageId={props.pageId} />
        </ColWrapper>
      </ColWrapper>
      <ColWrapper
        flex={1}
        alignment="end"
        hideInSmallContainer
        hidden={!displayProperties['createDate']}
      >
        <PageCreateDateCell createDate={props.createDate} />
      </ColWrapper>
      <ColWrapper
        flex={1}
        alignment="end"
        hideInSmallContainer
        hidden={!displayProperties['updatedDate']}
      >
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
  const [selectionState, setSelectionActive] = useAtom(selectionStateAtom);
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!selectionState.selectable) {
        return false;
      }
      stopPropagation(e);
      if (e.shiftKey) {
        setSelectionActive(true);
        onClick?.();
        return true;
      }
      onClick?.();
      return false;
    },
    [onClick, selectionState.selectable, setSelectionActive]
  );

  const commonProps = useMemo(
    () => ({
      'data-testid': 'page-list-item',
      'data-page-id': pageId,
      'data-draggable': draggable,
      className: styles.root,
      'data-clickable': !!onClick || !!to,
      'data-dragging': isDragging,
      onClick: onClick ? handleClick : undefined,
    }),
    [pageId, draggable, onClick, to, isDragging, handleClick]
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
