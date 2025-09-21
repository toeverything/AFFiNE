export { createFactory } from './factory';
export * from './team-workspace.mock';
export * from './user.mock';
export * from './workspace.mock';
export * from './workspace-user.mock';

import { MockAccessToken } from './access-token.mock';
import { MockCopilotProvider } from './copilot.mock';
import { MockDocMeta } from './doc-meta.mock';
import { MockDocSnapshot } from './doc-snapshot.mock';
import { MockDocUser } from './doc-user.mock';
import { MockEventBus } from './eventbus.mock';
import { MockMailer } from './mailer.mock';
import { MockJobQueue } from './queue.mock';
import { MockTeamWorkspace } from './team-workspace.mock';
import { MockUser } from './user.mock';
import { MockUserSettings } from './user-settings.mock';
import { MockWorkspace } from './workspace.mock';
import { MockWorkspaceUser } from './workspace-user.mock';

export const Mockers = {
  User: MockUser,
  Workspace: MockWorkspace,
  TeamWorkspace: MockTeamWorkspace,
  WorkspaceUser: MockWorkspaceUser,
  UserSettings: MockUserSettings,
  DocMeta: MockDocMeta,
  DocSnapshot: MockDocSnapshot,
  DocUser: MockDocUser,
  AccessToken: MockAccessToken,
};

export { MockCopilotProvider, MockEventBus, MockJobQueue, MockMailer };
