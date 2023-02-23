import dynamic from 'next/dynamic';
import React from 'react';

import { BlockSuiteEditorHeader } from '../components/blocksuite/header';
import { PageNotFoundError } from '../components/BlockSuiteErrorBoundary';
import { FlavourToWorkspace, RemWorkspaceFlavour } from '.';

type SettingPanelProps<Flavour extends RemWorkspaceFlavour> = {
  currentWorkspace: FlavourToWorkspace[Flavour];
};

type PageDetailProps<Flavour extends RemWorkspaceFlavour> = {
  currentWorkspace: FlavourToWorkspace[Flavour];
  currentPageId: string;
};

export interface UIPlugin<Flavour extends RemWorkspaceFlavour> {
  flavour: Flavour;
  PageDetail: React.FC<PageDetailProps<Flavour>>;
  SettingPanel: React.FC<SettingPanelProps<Flavour>>;
}

const Editor = dynamic(
  async () =>
    (await import('../components/blocksuite/block-suite-editor'))
      .BlockSuiteEditor,
  {
    ssr: false,
  }
);

const AffineUIPlugin: UIPlugin<RemWorkspaceFlavour.AFFINE> = {
  flavour: RemWorkspaceFlavour.AFFINE,
  PageDetail: ({ currentWorkspace, currentPageId }) => {
    if (!currentWorkspace.firstBinarySynced) {
      return <div>Loading</div>;
    }
    const page = currentWorkspace.blockSuiteWorkspace.getPage(currentPageId);
    if (!page) {
      throw new PageNotFoundError(
        currentWorkspace.blockSuiteWorkspace,
        currentPageId
      );
    }
    return (
      <>
        <BlockSuiteEditorHeader
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
          pageId={currentPageId}
        />
        <Editor page={page} />
      </>
    );
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
