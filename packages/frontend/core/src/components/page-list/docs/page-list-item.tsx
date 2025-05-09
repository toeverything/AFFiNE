import { Checkbox, Tooltip, useDraggable } from '@affine/component';
import { TagService } from '@affine/core/modules/tag';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { stopPropagation } from '@affine/core/utils';
import { i18nTime } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import type { ForwardedRef, PropsWithChildren } from 'react';
import { forwardRef, useCallback, useEffect, useMemo } from 'react';

import { WorkbenchLink } from '../../../modules/workbench/view/workbench-link';
import {
  anchorIndexAtom,
  rangeIdsAtom,
  selectionStateAtom,
  useAtom,
} from '../scoped-atoms';
import type { PageListItemProps } from '../types';
import { useAllDocDisplayProperties } from '../use-all-doc-display-properties';
import { ColWrapper } from '../utils';
import * as styles from './page-list-item.css';
import { PageTags } from './page-tags';

const ListTitleCell = ({
  title,
  preview,
}: Pick<PageListItemProps, 'title' | 'preview'>) => {
  const [displayProperties] = useAllDocDisplayProperties();
  return (
    <div data-testid="page-list-item-title" className={styles.titleCell}>
      <div
        data-testid="page-list-item-title-text"
        className={styles.titleCellMain}
      >
        {title}
      </div>
      {preview && displayProperties.displayProperties.bodyNotes ? (
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
  const tagList = useService(TagService).tagList;
  const tags = useLiveData(tagList.tagsByPageId$(pageId));

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
    <Tooltip content={i18nTime(createDate)}>
      <div
        data-testid="page-list-item-date"
        data-date-raw={createDate}
        className={styles.dateCell}
      >
        {i18nTime(createDate, {
          relative: true,
        })}
      </div>
    </Tooltip>
  );
};

const PageUpdatedDateCell = ({
  updatedDate,
}: Pick<PageListItemProps, 'updatedDate'>) => {
  return (
    <Tooltip content={updatedDate ? i18nTime(updatedDate) : undefined}>
      <div
        data-testid="page-list-item-date"
        data-date-raw={updatedDate}
        className={styles.dateCell}
      >
        {updatedDate
          ? i18nTime(updatedDate, {
              relative: true,
            })
          : '-'}
      </div>
    </Tooltip>
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
  const [displayProperties] = useAllDocDisplayProperties();
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

  const { dragRef, CustomDragPreview, dragging } = useDraggable<AffineDNDData>(
    () => ({
      canDrag: props.draggable,
      data: {
        entity: {
          type: 'doc',
          id: props.pageId,
        },
        from: {
          at: 'all-docs:list',
        },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.draggable, props.pageId, props.selectable]
  );

  return (
    <>
      <PageListItemWrapper
        onClick={props.onClick}
        to={props.to}
        pageId={props.pageId}
        draggable={props.draggable}
        isDragging={dragging}
        ref={dragRef}
        pageIds={props.pageIds || []}
      >
        <ColWrapper flex={9}>
          <ColWrapper className={styles.dndCell} flex={8}>
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
            hidden={!displayProperties.displayProperties.tags}
          >
            <PageTagsCell pageId={props.pageId} />
          </ColWrapper>
        </ColWrapper>
        <ColWrapper
          flex={1}
          alignment="end"
          hideInSmallContainer
          hidden={!displayProperties.displayProperties.createDate}
        >
          <PageCreateDateCell createDate={props.createDate} />
        </ColWrapper>
        <ColWrapper
          flex={1}
          alignment="end"
          hideInSmallContainer
          hidden={!displayProperties.displayProperties.updatedDate}
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
      <CustomDragPreview position="pointer-outside">
        {pageTitleElement}
      </CustomDragPreview>
    </>
  );
};

type PageListWrapperProps = PropsWithChildren<
  Pick<PageListItemProps, 'to' | 'pageId' | 'onClick' | 'draggable'> & {
    isDragging: boolean;
    pageIds: string[];
  }
>;

const PageListItemWrapper = forwardRef(
  (
    {
      to,
      isDragging,
      pageId,
      pageIds,
      onClick,
      children,
      draggable,
    }: PageListWrapperProps,
    ref: ForwardedRef<HTMLAnchorElement & HTMLDivElement>
  ) => {
    const [selectionState, setSelectionActive] = useAtom(selectionStateAtom);
    const [anchorIndex, setAnchorIndex] = useAtom(anchorIndexAtom);
    const [rangeIds, setRangeIds] = useAtom(rangeIdsAtom);

    const handleShiftClick = useCallback(
      (currentIndex: number) => {
        if (anchorIndex === undefined) {
          setAnchorIndex(currentIndex);
          onClick?.();
          return;
        }

        const lowerIndex = Math.min(anchorIndex, currentIndex);
        const upperIndex = Math.max(anchorIndex, currentIndex);
        const newRangeIds = pageIds.slice(lowerIndex, upperIndex + 1);

        const currentSelected = selectionState.selectedIds || [];

        // Set operations
        const setRange = new Set(rangeIds);
        const newSelected = new Set(
          currentSelected.filter(id => !setRange.has(id)).concat(newRangeIds)
        );

        selectionState.onSelectedIdsChange?.([...newSelected]);
        setRangeIds(newRangeIds);
      },
      [
        anchorIndex,
        onClick,
        pageIds,
        selectionState,
        setAnchorIndex,
        rangeIds,
        setRangeIds,
      ]
    );

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        if (!selectionState.selectable) {
          return;
        }
        e.stopPropagation();
        const currentIndex = pageIds.indexOf(pageId);

        if (e.shiftKey) {
          e.preventDefault();
          if (!selectionState.selectionActive) {
            setSelectionActive(true);
            setAnchorIndex(currentIndex);
            onClick?.();
          } else {
            handleShiftClick(currentIndex);
          }
        } else {
          setAnchorIndex(undefined);
          setRangeIds([]);
          onClick?.();
          return;
        }
      },
      [
        handleShiftClick,
        onClick,
        pageId,
        pageIds,
        selectionState.selectable,
        selectionState.selectionActive,
        setAnchorIndex,
        setRangeIds,
        setSelectionActive,
      ]
    );

    const commonProps = useMemo(
      () => ({
        role: 'list-item',
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

    useEffect(() => {
      if (selectionState.selectionActive) {
        // listen for shift key up
        const handleKeyUp = (e: KeyboardEvent) => {
          if (e.key === 'Shift') {
            setAnchorIndex(undefined);
            setRangeIds([]);
          }
        };
        window.addEventListener('keyup', handleKeyUp);
        return () => {
          window.removeEventListener('keyup', handleKeyUp);
        };
      }
      return;
    }, [
      selectionState.selectionActive,
      setAnchorIndex,
      setRangeIds,
      setSelectionActive,
    ]);

    if (to) {
      return (
        <WorkbenchLink ref={ref} draggable={false} {...commonProps} to={to}>
          {children}
        </WorkbenchLink>
      );
    } else {
      return (
        <div ref={ref} {...commonProps}>
          {children}
        </div>
      );
    }
  }
);
PageListItemWrapper.displayName = 'PageListItemWrapper';
