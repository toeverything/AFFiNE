import type { ShareInboxProvider } from '@affine/core/mobile/components/share-import-controller';
import { Capacitor, registerPlugin } from '@capacitor/core';

import type { ShareInboxPlugin } from './definitions';

const plugin = registerPlugin<ShareInboxPlugin>('ShareInbox');

const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const shareInboxProvider: ShareInboxProvider = {
  async updateWorkspaceMode(mode) {
    await plugin.updateWorkspaceMode({ mode });
  },
  async listPending() {
    return (await plugin.listPending()).items;
  },
  async updateTarget(itemId, target) {
    await plugin.updateTarget({ itemId, target });
  },
  async resolveAttachment(itemId) {
    const { path, mimeType } = await plugin.resolveAttachment({ itemId });
    if (!path) return undefined;
    const response = await fetch(Capacitor.convertFileSrc(path));
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return blobToDataURL(
      mimeType && blob.type !== mimeType
        ? new Blob([blob], { type: mimeType })
        : blob
    );
  },
  async complete(itemId, docId) {
    await plugin.complete({ itemId, docId });
  },
  async setError(itemId, error) {
    await plugin.setError({ itemId, error });
  },
};
