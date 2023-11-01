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
  createDate: Date;
  updatedDate?: Date;
  isPublicPage?: boolean;
  to?: To; // whether or not to render this item as a Link
  draggable?: boolean; // whether or not to allow dragging this item
  selectable?: boolean; // show selection checkbox
  selected?: boolean;
  operations?: ReactNode; // operations to show on the right side of the item
  onClick?: () => void;
  onSelectedChange?: () => void;
};

export interface PageListHeaderProps {}

// todo: a temporary solution. may need to be refactored later
export type PagesGroupByType = 'createDate' | 'updatedDate'; // todo: can add more later

// todo: a temporary solution. may need to be refactored later
export interface SortBy {
  key: 'createDate' | 'updatedDate';
  order: 'asc' | 'desc';
}

export type DateKey = 'createDate' | 'updatedDate';

export interface PageListProps {
  // required data:
  pages: PageMeta[];
  blockSuiteWorkspace: Workspace;
  className?: string;
  hideHeader?: boolean; // whether or not to hide the header. default is false (showing header)
  groupBy?: PagesGroupByType | false;
  isPreferredEdgeless: (pageId: string) => boolean; // determines the icon used for each row
  rowAsLink?: boolean;
  selectable?: 'toggle' | boolean; // show selection checkbox. toggle means showing a toggle selection in header on click; boolean == true means showing a selection checkbox for each item
  selectedPageIds?: string[]; // selected page ids
  onSelectedPageIdsChange?: (selected: string[]) => void;
  onSelectionActiveChange?: (active: boolean) => void;
  draggable?: boolean; // whether or not to allow dragging this page item
  // we also need the following to make sure the page list functions properly
  // maybe we could also give a function to render PageListItem?
  pageOperationsRenderer?: (page: PageMeta) => ReactNode;
}

export interface VirtualizedPageListProps extends PageListProps {
  heading?: ReactNode; // the user provided heading part (non sticky, above the original header)
  atTopThreshold?: number; // the threshold to determine whether or not the user has scrolled to the top. default is 0
  atTopStateChange?: (atTop: boolean) => void; // called when the user scrolls to the top or not
}

export interface PageListHandle {
  toggleSelectable: () => void;
}

export interface PageGroupDefinition {
  id: string;
  // using a function to render custom group header
  label: (() => ReactNode) | ReactNode;
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

export type DraggableTitleCellData = {
  pageId: string;
  pageTitle: ReactNode;
};
