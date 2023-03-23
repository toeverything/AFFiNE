import type { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';

export const enum LoadPriority {
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
}

export const enum WorkspaceFlavour {
  AFFINE = 'affine',
  LOCAL = 'local',
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WorkspaceRegistry {}

export interface WorkspaceCRUD<Key extends keyof WorkspaceRegistry> {
  create: (blockSuiteWorkspace: BlockSuiteWorkspace) => Promise<string>;
  delete: (workspace: WorkspaceRegistry[Key]) => Promise<void>;
  get: (workspaceId: string) => Promise<WorkspaceRegistry[Key] | null>;
  // not supported yet
  // update: (workspace: FlavourToWorkspace[Flavour]) => Promise<void>;
  list: () => Promise<WorkspaceRegistry[Key][]>;
}
