import type {
  ShareImportTarget,
  ShareInboxEntry,
} from '@affine/core/mobile/components/share-import-controller/types';

export interface ShareInboxPlugin {
  updateWorkspaceMode(options: {
    mode: 'selfHostedPresent' | 'cloudOnly' | 'signedOut' | 'unknown';
  }): Promise<void>;
  listPending(): Promise<{ items: ShareInboxEntry[] }>;
  updateTarget(options: {
    itemId: string;
    target: ShareImportTarget;
  }): Promise<void>;
  resolveAttachment(options: { itemId: string }): Promise<{
    itemId?: string;
    fileUrl?: string;
    relativePath?: string;
    name?: string;
    mimeType?: string;
    size?: number;
  }>;
  complete(options: { itemId: string; docId: string }): Promise<void>;
  setError(options: { itemId: string; error: string }): Promise<void>;
}
