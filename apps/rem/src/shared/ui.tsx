import React from 'react';

import { FlavourToWorkspace, RemWorkspaceFlavour } from '.';

type SettingPanelProps<Flavour extends RemWorkspaceFlavour> = {
  currentWorkspace: FlavourToWorkspace[Flavour];
};

type PageDetailProps<Flavour extends RemWorkspaceFlavour> = {
  currentWorkspace: FlavourToWorkspace[Flavour];
};

export interface UIPlugin<Flavour extends RemWorkspaceFlavour> {
  flavour: Flavour;
  PageDetail: React.FC<PageDetailProps<Flavour>>;
  SettingPanel: React.FC<SettingPanelProps<Flavour>>;
}

const AffineUIPlugin: UIPlugin<RemWorkspaceFlavour.AFFINE> = {
  flavour: RemWorkspaceFlavour.AFFINE,
  PageDetail: ({ currentWorkspace }) => {
    if (!currentWorkspace.firstBinarySynced) {
      return <div>Loading</div>;
    }
    return <div>WIP AFFINE UI</div>;
  },
  SettingPanel: ({ currentWorkspace }) => {
    if (!currentWorkspace.firstBinarySynced) {
      return <div>workspace is loading...</div>;
    }
    return <div></div>;
  },
};

const LocalUIPlugin: UIPlugin<RemWorkspaceFlavour.LOCAL> = {
  flavour: RemWorkspaceFlavour.LOCAL,
  PageDetail: ({ currentWorkspace }) => {
    return <div>WIP</div>;
  },
  SettingPanel: ({ currentWorkspace }) => {
    return <div>WIP</div>;
  },
};

export const UIPlugins = {
  [RemWorkspaceFlavour.AFFINE]: AffineUIPlugin,
  [RemWorkspaceFlavour.LOCAL]: LocalUIPlugin,
} satisfies {
  [Key in RemWorkspaceFlavour]: UIPlugin<Key>;
};
