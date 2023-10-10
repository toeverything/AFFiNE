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

function stopPropagation(event: React.MouseEvent) {
  event.stopPropagation();
  event.preventDefault();
}

const PageListTitleCell = (
  props: Pick<PageListItemProps, 'title' | 'preview'>
) => {
  return (
    <div data-testid="page-list-item-title" className={styles.titleCell}>
      <div
        data-testid="page-list-item-title-text"
        className={styles.titleCellMain}
      >
        {props.title}
      </div>
      {props.preview ? (
        <div
          data-testid="page-list-item-preview-text"
          className={styles.titleCellPreview}
        >
          {props.preview}
        </div>
      ) : null}
    </div>
  );
};

const PageListIconCell = (props: Pick<PageListItemProps, 'icon'>) => {
  return (
    <div data-testid="page-list-item-icon" className={styles.iconCell}>
      {props.icon}
    </div>
  );
};

const PageSelectionCell = (
  props: Pick<PageListItemProps, 'selectable' | 'onSelectedChange' | 'selected'>
) => {
  const onSelectionChange = useCallback(
    (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
      return props.onSelectedChange?.(checked);
    },
    [props]
  );
  return (
    <div className={styles.selectionCell}>
      {props.selectable ? (
        <Checkbox
          onClick={stopPropagation}
          checked={props.selected}
          value={props.selected}
          onChange={onSelectionChange}
          size="small"
        />
      ) : null}
    </div>
  );
};

export const PageTagsCell = (props: Pick<PageListItemProps, 'tags'>) => {
  return (
    <div data-testid="page-list-item-tags" className={styles.tagsCell}>
      {/* fixme: give dynamic width & maxWidth */}
      <PageTags tags={props.tags} width={100} maxWidth={600} />
    </div>
  );
};

const PageCreateDateCell = (props: Pick<PageListItemProps, 'createDate'>) => {
  return (
    <div data-testid="page-list-item-date" className={styles.dateCell}>
      {formatDate(props.createDate)}
    </div>
  );
};

const PageUpdatedDateCell = (props: Pick<PageListItemProps, 'updatedDate'>) => {
  return (
    <div data-testid="page-list-item-date" className={styles.dateCell}>
      {formatDate(props.updatedDate)}
    </div>
  );
};

const PageFavoriteCell = (
  props: Pick<PageListItemProps, 'favorite' | 'onToggleFavorite'>
) => {
  const onClick: MouseEventHandler = useCallback(
    e => {
      stopPropagation(e);
      props.onToggleFavorite?.();
    },
    [props]
  );
  return (
    <div data-testid="page-list-item-favorite" className={styles.favoriteCell}>
      <FavoriteTag onClick={onClick} active={!!props.favorite} />
    </div>
  );
};

const PageListOperationsCell = (
  props: Pick<PageListItemProps, 'operations'>
) => {
  return props.operations ? (
    <div
      onClick={stopPropagation}
      data-testid="page-list-group-header"
      className={styles.operationsCell}
    >
      {props.operations}
    </div>
  ) : null;
};

export const PageListItem = (props: PageListItemProps) => {
  return (
    <PageListItemWrapper {...props}>
      <FlexWrapper flex={6}>
        <PageSelectionCell {...props} />
        <PageListIconCell {...props} />
        <PageListTitleCell {...props} />
      </FlexWrapper>
      <FlexWrapper flex={3} alignment="end">
        <PageTagsCell {...props} />
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

const PageListItemWrapper = (
  props: Pick<PageListItemProps, 'to' | 'pageId'> & PropsWithChildren
) => {
  const commonProps = useMemo(
    () => ({
      'data-testid': 'page-list-item',
      'data-page-id': props.pageId,
      className: styles.root,
    }),
    [props.pageId]
  );
  if (props.to) {
    return (
      <Link {...commonProps} to={props.to}>
        {props.children}
      </Link>
    );
  } else {
    return <div {...commonProps}>{props.children}</div>;
  }
};

const FlexWrapper = (
  props: PropsWithChildren<{
    flex: number;
    alignment?: 'start' | 'center' | 'end';
    styles?: React.CSSProperties;
  }>
) => {
  return (
    <div
      data-testid="page-list-item-flex-wrapper"
      style={{
        ...styles,
        flexGrow: props.flex,
        flexBasis: `${(props.flex / 12) * 100}%`,
        justifyContent: props.alignment,
      }}
      className={styles.flexWrapper}
    >
      {props.children}
    </div>
  );
};
