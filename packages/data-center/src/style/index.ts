export enum WorkspaceType {
  local = 'local',
  cloud = 'cloud',
}

export type Workspace = {
  name: string;
  id: string;
  isPublish?: boolean;
  avatar?: string;
  type: WorkspaceType;
  owner?: User;
  isLocal?: boolean;
  memberCount: number;
};

export type User = {
  name: string;
  id: string;
  email: string;
  avatar: string;
};

export type WorkspaceMeta = Pick<Workspace, 'name' | 'avatar'>;
