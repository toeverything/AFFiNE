import dynamic from 'next/dynamic';
import React from 'react';

import { BlockSuitePageList } from '../components/blocksuite/block-suite-page-list';
import { BlockSuiteEditorHeader } from '../components/blocksuite/header';
import { PageNotFoundError } from '../components/BlockSuiteErrorBoundary';
import {
  BlockSuiteWorkspace,
  FlavourToWorkspace,
  RemWorkspaceFlavour,
} from '../shared';

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
  PageList: ({ blockSuiteWorkspace, onClickPage }) => {
    return (
      <BlockSuitePageList
        onClickPage={onClickPage}
        blockSuiteWorkspace={blockSuiteWorkspace}
      />
    );
  },
  SettingPanel: WIP,
};

const LocalUIPlugin: UIPlugin<RemWorkspaceFlavour.LOCAL> = {
  flavour: RemWorkspaceFlavour.LOCAL,
  PageDetail: WIP,
  SettingPanel: WIP,
  PageList: WIP,
};

export const UIPlugins = {
  [RemWorkspaceFlavour.AFFINE]: AffineUIPlugin,
  [RemWorkspaceFlavour.LOCAL]: LocalUIPlugin,
} satisfies {
  [Key in RemWorkspaceFlavour]: UIPlugin<Key>;
};
