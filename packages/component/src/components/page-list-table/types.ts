import type { Tag } from '@affine/env/filter';
import type { ReactNode } from 'react';
import type { To } from 'react-router-dom';

// TODO: consider reducing the number of props here
export interface PageListItemProps {
  pageId: string;
  icon: JSX.Element;
  title: ReactNode; // using ReactNode to allow for rich content rendering
  preview?: ReactNode; // using ReactNode to allow for rich content rendering
  tags: Tag[];
  favorite: boolean;
  createDate: Date;
  updatedDate: Date;
  isPublicPage?: boolean;
  to?: To; // whether or not to render this item as a Link
  draggable?: boolean; // whether or not to allow dragging this item
  selectable?: boolean; // show selection checkbox
  selected?: boolean;
  operations?: ReactNode; // operations to show on the right side of the item
  onClickPage: (newTab?: boolean) => void;
  onSelectedChange?: (selected: boolean) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onFavoritePage?: (favorite: boolean) => void;
}

export interface PageListGroupHeaderProps {
  title: string;
  icon?: JSX.Element;
  count?: number;
  totalCount?: number;
}

export interface PageListHeaderProps {}

// todo: a temporary solution. may need to be refactored later
export type GroupBy = 'createDate' | 'updatedDate'; // todo: can add more later

// todo: a temporary solution. may need to be refactored later
export interface SortBy {
  key: 'createDate' | 'updatedDate';
  order: 'asc' | 'desc';
}

export interface PageListProps {
  className?: string;
  list: PageListItemProps[];
  groupBy?: GroupBy;
  sortBy?: SortBy;
  fallback?: ReactNode; // fixme: shall we use loading rows number instead?
}
