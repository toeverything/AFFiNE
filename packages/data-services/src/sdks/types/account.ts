enum WorkspacePermission {
  read = 'read',
  write = 'write',
}

export type RequestInviteCollaborator = {
  email: string;
  workspace_id: string;
};

export type ResponseInviteCollaborator = {
  inviting_code: string;
};

export type RequestRemoveCollaborator = {
  user_id: string;
  workspace_id: string;
};

export type ResponseRemoveCollaborator = {
  workspace_id: string;
};

export type RequestAcceptInviting = {
  inviting_code: string;
};

export type ResponseAcceptInviting = {
  workspace_id: string;
  name: string;
  avatar_url: string;
  permissions: WorkspacePermission;
};
