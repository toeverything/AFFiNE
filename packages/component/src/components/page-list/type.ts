import type { Tag } from '@affine/env/filter';
import type { PropertiesMeta } from '@affine/env/filter';
import type { GetPageInfoById } from '@affine/env/page-info';

/**
 * Get the keys of an object type whose values are of a given type
 *
 * See https://stackoverflow.com/questions/54520676/in-typescript-how-to-get-the-keys-of-an-object-type-whose-values-are-of-a-given
 */
export type KeysMatching<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

export type ListData = {
  pageId: string;
  icon: JSX.Element;
  title: string;
  preview?: React.ReactNode;
  tags: Tag[];
  favorite: boolean;
  createDate: Date;
  updatedDate: Date;
  isPublicPage: boolean;
  onClickPage: () => void;
  onOpenPageInNewTab: () => void;
  bookmarkPage: () => void;
  removeToTrash: () => void;
  onDisablePublicSharing: () => void;
};

export type DateKey = KeysMatching<ListData, Date>;

export type TrashListData = {
  pageId: string;
  icon: JSX.Element;
  title: string;
  preview?: React.ReactNode;
  createDate: Date;
  // TODO remove optional after assert that trashDate is always set
  trashDate?: Date;
  onClickPage: () => void;
  onRestorePage: () => void;
  onPermanentlyDeletePage: () => void;
};

export type PageListProps = {
  isPublicWorkspace?: boolean;
  workspaceId: string;
  list: ListData[];
  fallback?: React.ReactNode;
  onCreateNewPage: () => void;
  onCreateNewEdgeless: () => void;
  onImportFile: () => void;
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
};

export type DraggableTitleCellData = {
  pageId: string;
  pageTitle: string;
  pagePreview?: string;
  icon: React.ReactElement;
};
