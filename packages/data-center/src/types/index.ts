import { getLogger } from '../logger';

export type WorkspaceInfo = {
  name: string;
  id: string;
  isPublish?: boolean;
  avatar?: string;
  owner?: User;
  isLocal?: boolean;
  memberCount: number;
  provider: string;
};

export type User = {
  name: string;
  id: string;
  email: string;
  avatar: string;
};

export type WorkspaceMeta = Pick<WorkspaceInfo, 'name' | 'avatar'>;

export type Logger = ReturnType<typeof getLogger>;

export type Message = {
  code: number;
  message: string;
};
