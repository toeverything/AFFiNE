import type {
  PendingShareItem,
  ShareImportTarget,
} from '@affine/core/mobile/components/share-import-controller/types';

export interface ShareInboxPlugin {
  updateWorkspaceMode(options: {
    mode: 'selfHostedPresent' | 'cloudOnly' | 'signedOut' | 'unknown';
  }): Promise<void>;
  listPending(): Promise<{ items: PendingShareItem[] }>;
  updateTarget(options: {
    itemId: string;
    target: ShareImportTarget;
  }): Promise<void>;
  resolveAttachment(options: {
    itemId: string;
  }): Promise<{ path?: string; mimeType?: string }>;
  complete(options: { itemId: string; docId: string }): Promise<void>;
  setError(options: { itemId: string; error: string }): Promise<void>;
}
