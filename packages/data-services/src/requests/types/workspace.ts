enum WorkspaceType {
  'personal' = 'personal',
  'team' = 'team',
}

export type Workspace = {
  id: string;
  name: string;
  workspace_type: WorkspaceType;
  avatar_url?: string;
  public: boolean;
};

export type ResponseGetWorkspaces = {
  create: Array<Workspace>;
  read: Array<Workspace>;
  write: Array<Workspace>;
};

export type RequestCreateWorkspace = {
  name: string;
  avatar_url?: string;
  workspace_type: WorkspaceType;
};

export type RequestUpdateWorkspace = {
  workspace_type?: WorkspaceType;
  avatar_url?: string;
  public?: boolean;
};

export type ResponseCreateWorkspace = any;
