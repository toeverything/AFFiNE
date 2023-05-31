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
  preview?: string;
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
  preview?: string;
  createDate: Date;
  // TODO remove optional after assert that trashDate is always set
  trashDate?: Date;
  onClickPage: () => void;
  onRestorePage: () => void;
  onPermanentlyDeletePage: () => void;
};

export type PageListProps = {
  isPublicWorkspace?: boolean;
  list: ListData[];
  onCreateNewPage: () => void;
  onCreateNewEdgeless: () => void;
  onImportFile: () => void;
};

export type DraggableTitleCellData = {
  pageId: string;
  pageTitle: string;
  pagePreview?: string;
  icon: React.ReactElement;
};
