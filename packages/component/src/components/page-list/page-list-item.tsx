import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Checkbox } from '@mui/material';
import {
  type MouseEventHandler,
  type PropsWithChildren,
  useCallback,
  useMemo,
} from 'react';
import { Link } from 'react-router-dom';

import { FavoriteTag } from './components/favorite-tag';
import * as styles from './page-list-item.css';
import { PageTags } from './page-tags';
import type { PageListItemProps } from './types';
import { FlexWrapper, formatDate } from './utils';

function stopPropagation(event: React.MouseEvent) {
  event.stopPropagation();
  event.preventDefault();
}

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
      {updatedDate ? formatDate(updatedDate) : '-'}
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
    <div
      data-testid="page-list-item-favorite"
      data-favorite={favorite ? true : undefined}
      className={styles.favoriteCell}
    >
      <FavoriteTag onClick={onClick} active={!!favorite} />
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
  return (
    <PageListItemWrapper to={props.to} pageId={props.pageId}>
      <FlexWrapper flex={9}>
        <FlexWrapper flex={8}>
          <PageSelectionCell
            onSelectedChange={props.onSelectedChange}
            selectable={props.selectable}
            selected={props.selected}
          />
          <PageListIconCell icon={props.icon} />
          <PageListTitleCell title={props.title} preview={props.preview} />
        </FlexWrapper>
        <FlexWrapper flex={4} alignment="end">
          <PageTagsCell tags={props.tags} />
        </FlexWrapper>
      </FlexWrapper>
      <FlexWrapper flex={1} alignment="end">
        <PageCreateDateCell createDate={props.createDate} />
      </FlexWrapper>
      <FlexWrapper flex={1} alignment="end">
        <PageUpdatedDateCell updatedDate={props.updatedDate} />
      </FlexWrapper>
      <FlexWrapper
        className={styles.actionsCellWrapper}
        flex={1}
        alignment="end"
      >
        <PageFavoriteCell
          favorite={props.favorite}
          onToggleFavorite={props.onToggleFavorite}
        />
        <PageListOperationsCell operations={props.operations} />
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
