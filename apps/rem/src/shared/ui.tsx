import React from 'react';

import { FlavourToWorkspace, RemWorkspaceFlavour } from '.';

type SettingPanelProps<Flavour extends RemWorkspaceFlavour> = {
  currentWorkspace: FlavourToWorkspace[Flavour];
};

export interface UIPlugin<Flavour extends RemWorkspaceFlavour> {
  flavour: Flavour;
  SettingPanel: React.FC<SettingPanelProps<Flavour>>;
}

const AffineUIPlugin: UIPlugin<RemWorkspaceFlavour.AFFINE> = {
  flavour: RemWorkspaceFlavour.AFFINE,
  SettingPanel: ({ currentWorkspace }) => {
    if (!currentWorkspace.firstBinarySynced) {
      return <div>workspace is loading...</div>;
    }
    return <div></div>;
  },
};
