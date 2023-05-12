import type { Page } from '@blocksuite/store';

import type { AllWorkspace } from '../../../shared';

export type FavoriteListProps = {
  currentWorkspace: AllWorkspace;
};

export type WorkSpaceSliderBarProps = {
  isPublicWorkspace: boolean;
  onOpenQuickSearchModal: () => void;
  onOpenWorkspaceListModal: () => void;
  currentWorkspace: AllWorkspace | null;
  currentPageId: string | null;
  openPage: (pageId: string) => void;
  createPage: () => Page;
  currentPath: string;
  paths: {
    all: (workspaceId: string) => string;
    favorite: (workspaceId: string) => string;
    trash: (workspaceId: string) => string;
    setting: (workspaceId: string) => string;
    shared: (workspaceId: string) => string;
  };
};
