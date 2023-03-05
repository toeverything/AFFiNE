import React from 'react';

import { jotaiStore, jotaiWorkspacesAtom } from '../atoms';
import {
  BlockSuiteWorkspace,
  FlavourToWorkspace,
  LoadPriority,
  RemWorkspaceFlavour,
  SettingPanel,
} from '../shared';
import { AffinePlugin } from './affine';
import { LocalPlugin } from './local';

type UIBaseProps<Flavour extends RemWorkspaceFlavour> = {
  currentWorkspace: FlavourToWorkspace[Flavour];
};

type SettingProps<Flavour extends RemWorkspaceFlavour> =
  UIBaseProps<Flavour> & {
    currentTab: SettingPanel;
    onChangeTab: (tab: SettingPanel) => void;
    onDeleteWorkspace: () => void;
    onTransformWorkspace: (targetWorkspaceId: string) => void;
  };

type PageDetailProps<Flavour extends RemWorkspaceFlavour> =
  UIBaseProps<Flavour> & {
    currentPageId: string;
  };

type PageListProps<Flavour extends RemWorkspaceFlavour> = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  onOpenPage: (pageId: string, newTab?: boolean) => void;
};

type SideBarMenuProps<Flavour extends RemWorkspaceFlavour> =
  UIBaseProps<Flavour> & {
    setSideBarOpen: (open: boolean) => void;
  };

export interface WorkspacePlugin<Flavour extends RemWorkspaceFlavour> {
  flavour: Flavour;
  // Plugin will be loaded according to the priority
  loadPriority: LoadPriority;
  // Fetch necessary data for the first render
  CRUD: {
    create: (blockSuiteWorkspace: BlockSuiteWorkspace) => Promise<string>;
    delete: (workspace: FlavourToWorkspace[Flavour]) => Promise<void>;
    get: (workspaceId: string) => Promise<FlavourToWorkspace[Flavour] | null>;
    // not supported yet
    // update: (workspace: FlavourToWorkspace[Flavour]) => Promise<void>;
    list: () => Promise<FlavourToWorkspace[Flavour][]>;
  };

  //#region UI
  PageDetail: React.FC<PageDetailProps<Flavour>>;
  PageList: React.FC<PageListProps<Flavour>>;
  SettingsDetail: React.FC<SettingProps<Flavour>>;
  //#endregion
}

export const WorkspacePlugins = {
  [RemWorkspaceFlavour.AFFINE]: AffinePlugin,
  [RemWorkspaceFlavour.LOCAL]: LocalPlugin,
} satisfies {
  [Key in RemWorkspaceFlavour]: WorkspacePlugin<Key>;
};

/**
 * Transform workspace from one flavour to another
 *
 * The logic here is to delete the old workspace and create a new one.
 */
export async function transformWorkspace<
  From extends RemWorkspaceFlavour,
  To extends RemWorkspaceFlavour
>(from: From, to: To, workspace: FlavourToWorkspace[From]): Promise<string> {
  // fixme: type cast
  await WorkspacePlugins[from].CRUD.delete(workspace as any);
  const newId = await WorkspacePlugins[to].CRUD.create(
    workspace.blockSuiteWorkspace
  );
  const workspaces = jotaiStore.get(jotaiWorkspacesAtom);
  const idx = workspaces.findIndex(ws => ws.id === workspace.id);
  workspaces.splice(idx, 1, {
    id: newId,
    flavour: to,
  });
  jotaiStore.set(jotaiWorkspacesAtom, [...workspaces]);
  return newId;
}
