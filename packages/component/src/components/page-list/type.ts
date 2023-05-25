export type ListData = {
  pageId: string;
  icon: JSX.Element;
  title: string;
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

export type TrashListData = {
  pageId: string;
  icon: JSX.Element;
  title: string;
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
};
