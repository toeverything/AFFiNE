import React from 'react';

import {
  BlockSuiteWorkspace,
  FlavourToWorkspace,
  RemWorkspaceFlavour,
} from '../shared';
import { AffineUIPlugin } from './affine';
import { LocalUIPlugin } from './local';

const WIP = () => <div>WIP</div>;

type UIBaseProps<Flavour extends RemWorkspaceFlavour> = {
  currentWorkspace: FlavourToWorkspace[Flavour];
};

type SettingPanelProps<Flavour extends RemWorkspaceFlavour> =
  UIBaseProps<Flavour>;

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

export interface UIPlugin<Flavour extends RemWorkspaceFlavour> {
  flavour: Flavour;
  PageDetail: React.FC<PageDetailProps<Flavour>>;
  PageList: React.FC<PageListProps<Flavour>>;
  SettingPanel: React.FC<SettingPanelProps<Flavour>>;
}
export const UIPlugins = {
  [RemWorkspaceFlavour.AFFINE]: AffineUIPlugin,
  [RemWorkspaceFlavour.LOCAL]: LocalUIPlugin,
} satisfies {
  [Key in RemWorkspaceFlavour]: UIPlugin<Key>;
};
