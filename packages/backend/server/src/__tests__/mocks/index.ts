export { createFactory } from './factory';
export * from './team-workspace.mock';
export * from './user.mock';
export * from './workspace.mock';

import { MockMailer } from './mailer.mock';
import { MockTeamWorkspace } from './team-workspace.mock';
import { MockUser } from './user.mock';
import { MockWorkspace } from './workspace.mock';

export const Mockers = {
  User: MockUser,
  Workspace: MockWorkspace,
  TeamWorkspace: MockTeamWorkspace,
};

export { MockMailer };
