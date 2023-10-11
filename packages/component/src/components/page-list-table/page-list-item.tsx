import { Checkbox } from '@mui/material';
import {
  type MouseEventHandler,
  type PropsWithChildren,
  useCallback,
  useMemo,
} from 'react';
import { Link } from 'react-router-dom';

import { FavoriteTag, formatDate } from '../page-list';
import * as styles from './page-list-item.css';
import { PageTags } from './page-tags';
import type { PageListItemProps } from './types';
import { FlexWrapper } from './utils';

function stopPropagation(event: React.MouseEvent) {
  event.stopPropagation();
  event.preventDefault();
}

const PageListTitleCell = ({
  title,
  preview,
}: Pick<PageListItemProps, 'title' | 'preview'>) => {
  return (
    <div data-testid="page-list-item-title" className={styles.titleCell}>
      <div
        data-testid="page-list-item-title-text"
        className={styles.titleCellMain}
      >
        {title}
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
    (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
      return onSelectedChange?.(checked);
    },
    [onSelectedChange]
  );
  return (
    <div className={styles.selectionCell}>
      {selectable ? (
        <Checkbox
          onClick={stopPropagation}
          checked={selected}
          value={selected}
          onChange={onSelectionChange}
          size="small"
        />
      ) : null}
    </div>
  );
};

export const PageTagsCell = ({ tags }: Pick<PageListItemProps, 'tags'>) => {
  return (
    <div data-testid="page-list-item-tags" className={styles.tagsCell}>
      {/* fixme: give dynamic width & maxWidth */}
      <PageTags tags={tags} width={100} maxWidth={600} />
    </div>
  );
};

const PageCreateDateCell = ({
  createDate,
}: Pick<PageListItemProps, 'createDate'>) => {
  return (
    <div data-testid="page-list-item-date" className={styles.dateCell}>
      {formatDate(createDate)}
    </div>
  );
};

const PageUpdatedDateCell = ({
  updatedDate,
}: Pick<PageListItemProps, 'updatedDate'>) => {
  return (
    <div data-testid="page-list-item-date" className={styles.dateCell}>
      {formatDate(updatedDate)}
    </div>
  );
};

const PageFavoriteCell = ({
  favorite,
  onToggleFavorite,
}: Pick<PageListItemProps, 'favorite' | 'onToggleFavorite'>) => {
  const onClick: MouseEventHandler = useCallback(
    e => {
      stopPropagation(e);
      onToggleFavorite?.();
    },
    [onToggleFavorite]
  );
  return (
    <div data-testid="page-list-item-favorite" className={styles.favoriteCell}>
      <FavoriteTag onClick={onClick} active={!!favorite} />
    </div>
  );
};

const PageListOperationsCell = ({
  operations,
}: Pick<PageListItemProps, 'operations'>) => {
  return operations ? (
    <div
      onClick={stopPropagation}
      data-testid="page-list-group-header"
      className={styles.operationsCell}
    >
      {operations}
    </div>
  ) : null;
};

export const PageListItem = (props: PageListItemProps) => {
  return (
    <PageListItemWrapper {...props}>
      <FlexWrapper flex={9}>
        <FlexWrapper flex={8}>
          <PageSelectionCell {...props} />
          <PageListIconCell {...props} />
          <PageListTitleCell {...props} />
        </FlexWrapper>
        <FlexWrapper flex={4} alignment="end">
          <PageTagsCell {...props} />
        </FlexWrapper>
      </FlexWrapper>
      <FlexWrapper flex={1} alignment="end">
        <PageCreateDateCell {...props} />
      </FlexWrapper>
      <FlexWrapper flex={1} alignment="end">
        <PageUpdatedDateCell {...props} />
      </FlexWrapper>
      <FlexWrapper flex={1} alignment="end">
        <PageFavoriteCell {...props} />
        <PageListOperationsCell {...props} />
      </FlexWrapper>
    </PageListItemWrapper>
  );
};

const PageListItemWrapper = ({
  to,
  pageId,
  children,
}: Pick<PageListItemProps, 'to' | 'pageId'> & PropsWithChildren) => {
  const commonProps = useMemo(
    () => ({
      'data-testid': 'page-list-item',
      'data-page-id': pageId,
      className: styles.root,
    }),
    [pageId]
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
};
