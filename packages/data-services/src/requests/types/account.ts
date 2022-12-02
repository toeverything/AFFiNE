export type RequestInviteCollaborator = {
  email: string;
  workspace_id: string;
};

export type ResponseInviteCollaborator = {
  inviting_code: string;
};
