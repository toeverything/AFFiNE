import { getLogger } from 'src';

export type Workspace = {
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

export type WorkspaceMeta = Pick<Workspace, 'name' | 'avatar'>;

export type Logger = ReturnType<typeof getLogger>;
