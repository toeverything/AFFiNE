import { toolError } from './error';

export const LOCAL_WORKSPACE_SYNC_REQUIRED_MESSAGE =
  'This workspace is local-only and does not have AFFiNE Cloud sync enabled yet. Ask the user to enable workspace sync, then try again.';

export const DOCUMENT_SYNC_PENDING_MESSAGE = (docId: string) =>
  `Document ${docId} is not available on AFFiNE Cloud yet. Ask the user to wait for workspace sync to finish, then try again.`;

export const workspaceSyncRequiredError = () =>
  toolError('Workspace Sync Required', LOCAL_WORKSPACE_SYNC_REQUIRED_MESSAGE);

export const documentSyncPendingError = (docId: string) =>
  toolError('Document Sync Pending', DOCUMENT_SYNC_PENDING_MESSAGE(docId));
