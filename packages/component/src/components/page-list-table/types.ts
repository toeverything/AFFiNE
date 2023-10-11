import type { Tag } from '@affine/env/filter';
import type { PageMeta, Workspace } from '@blocksuite/store';
import type { ReactNode } from 'react';
import type { To } from 'react-router-dom';

// TODO: consider reducing the number of props here
// using type instead of interface to make it Record compatible
export type PageListItemProps = {
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
  onClickPage?: (newTab?: boolean) => void;
  onSelectedChange?: (selected: boolean) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onToggleFavorite?: () => void;
};

export interface PageListHeaderProps {}

// todo: a temporary solution. may need to be refactored later
export type PagesGroupByType = 'createDate' | 'updatedDate'; // todo: can add more later

// todo: a temporary solution. may need to be refactored later
export interface SortBy {
  key: 'createDate' | 'updatedDate';
  order: 'asc' | 'desc';
}

export interface PageListProps {
  className?: string;
  pages: PageMeta[];
  blockSuiteWorkspace: Workspace;
  groupBy?: PagesGroupByType;
  fallback?: ReactNode; // fixme: shall we use loading rows number instead?
  isPreferredEdgeless: (pageId: string) => boolean;
  onToggleFavorite: (pageId: string) => void;
  renderPageAsLink?: boolean; // whether or not to render each page as a router Link
  selectable?: boolean; // show selection checkbox
  selectedPageIds?: string[]; // selected page ids
  onSelectedPageIdsChange?: (selected: string[]) => void;
  onOpenPage?: (pageId: string, newTab?: boolean) => void;
  draggable?: boolean; // whether or not to allow dragging this page item
  onDragStart?: (pageId: string) => void;
  onDragEnd?: (pageId: string) => void;
  // we also need the following to make sure the page list functions properly
  // maybe we could also give a function to render PageListItem?
  pageOperationsRenderer?: (page: PageMeta) => ReactNode;
}

export interface PageGroupDefinition {
  id: string;
  // using a function to render custom group header
  label:
    | ((filtered: PageMeta[], allItems: PageMeta[]) => ReactNode)
    | ReactNode;
  match: (item: PageMeta) => boolean;
}

export interface PageGroupProps {
  id: string;
  label?: ReactNode; // if there is no label, it is a default group (without header)
  items: PageMeta[];
  allItems: PageMeta[];
}

type MakeRecord<T> = {
  [P in keyof T]: T[P];
};

export type PageMetaRecord = MakeRecord<PageMeta>;
