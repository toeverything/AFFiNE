import React from 'react';

import {
  BlockSuiteWorkspace,
  FlavourToWorkspace,
  LoadPriority,
  RemWorkspace,
  RemWorkspaceFlavour,
} from '../shared';
import { AffinePlugin } from './affine';
import { LocalPlugin } from './local';

const WIP = () => <div>WIP</div>;

type UIBaseProps<Flavour extends RemWorkspaceFlavour> = {
  currentWorkspace: FlavourToWorkspace[Flavour];
};

type SettingProps<Flavour extends RemWorkspaceFlavour> = UIBaseProps<Flavour>;

type PageDetailProps<Flavour extends RemWorkspaceFlavour> =
  UIBaseProps<Flavour> & {
    currentPageId: string;
  };

type PageListProps<Flavour extends RemWorkspaceFlavour> = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  onClickPage: (pageId: string) => void;
};

type SideBarMenuProps<Flavour extends RemWorkspaceFlavour> =
  UIBaseProps<Flavour> & {
    setSideBarOpen: (open: boolean) => void;
  };

export interface WorkspacePlugin<Flavour extends RemWorkspaceFlavour> {
  flavour: Flavour;
  loadPriority: LoadPriority;
  // Fetch necessary data for the first render
  prefetchData: (dataCenter: {
    workspaces: RemWorkspace[];
    callbacks: Set<() => void>;
  }) => Promise<unknown>;
  PageDetail: React.FC<PageDetailProps<Flavour>>;
  PageList: React.FC<PageListProps<Flavour>>;
  Setting: React.FC<SettingProps<Flavour>>;
}

export const UIPlugins = {
  [RemWorkspaceFlavour.AFFINE]: AffinePlugin,
  [RemWorkspaceFlavour.LOCAL]: LocalPlugin,
} satisfies {
  [Key in RemWorkspaceFlavour]: WorkspacePlugin<Key>;
};
