import type {
  LoadPriority,
  WorkspaceCRUD,
  WorkspaceRegistry,
} from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import type React from 'react';

import type {
  AffineWorkspace,
  BlockSuiteWorkspace,
  LocalWorkspace,
  SettingPanel,
} from '../shared';
import { AffinePlugin } from './affine';
import { LocalPlugin } from './local';

type UIBaseProps<Flavour extends WorkspaceFlavour> = {
  currentWorkspace: WorkspaceRegistry[Flavour];
};

type SettingProps<Flavour extends WorkspaceFlavour> = UIBaseProps<Flavour> & {
  currentTab: SettingPanel;
  onChangeTab: (tab: SettingPanel) => void;
  onDeleteWorkspace: () => void;
  onTransformWorkspace: <
    From extends WorkspaceFlavour,
    To extends WorkspaceFlavour
  >(
    from: From,
    to: To,
    workspace: WorkspaceRegistry[From]
  ) => void;
};

type PageDetailProps<Flavour extends WorkspaceFlavour> =
  UIBaseProps<Flavour> & {
    currentPageId: string;
  };

type PageListProps<Flavour extends WorkspaceFlavour> = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  onOpenPage: (pageId: string, newTab?: boolean) => void;
};

type SideBarMenuProps<Flavour extends WorkspaceFlavour> =
  UIBaseProps<Flavour> & {
    setSideBarOpen: (open: boolean) => void;
  };

declare module '@affine/workspace/type' {
  interface WorkspaceRegistry {
    [WorkspaceFlavour.AFFINE]: AffineWorkspace;
    [WorkspaceFlavour.LOCAL]: LocalWorkspace;
  }
}

export interface WorkspacePlugin<Flavour extends WorkspaceFlavour> {
  flavour: Flavour;
  // Plugin will be loaded according to the priority
  loadPriority: LoadPriority;
  // fixme: this is a hack
  cleanup?: () => void;
  // Fetch necessary data for the first render
  CRUD: WorkspaceCRUD<Flavour>;
  UI: {
    PageDetail: React.FC<PageDetailProps<Flavour>>;
    PageList: React.FC<PageListProps<Flavour>>;
    SettingsDetail: React.FC<SettingProps<Flavour>>;
  };
}

export const WorkspacePlugins = {
  [WorkspaceFlavour.AFFINE]: AffinePlugin,
  [WorkspaceFlavour.LOCAL]: LocalPlugin,
} satisfies {
  [Key in WorkspaceFlavour]: WorkspacePlugin<Key>;
};
