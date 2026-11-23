import type { ShareInboxProvider } from '@affine/core/mobile/components/share-import-controller';
import { Capacitor, registerPlugin } from '@capacitor/core';

import type { ShareInboxPlugin } from './definitions';

const plugin = registerPlugin<ShareInboxPlugin>('ShareInbox');

type AttachmentResolution = Awaited<
  ReturnType<ShareInboxPlugin['resolveAttachment']>
>;

export async function resolveShareInboxAttachment(
  itemId: string,
  resolution: AttachmentResolution,
  {
    convertFileSrc,
    fetchFile,
  }: {
    convertFileSrc: (path: string) => string;
    fetchFile: (url: string) => Promise<Response | undefined>;
  }
): Promise<File | undefined> {
  const {
    fileUrl,
    relativePath,
    mimeType,
    name,
    size,
    itemId: resolvedItemId,
  } = resolution;
  if (
    !fileUrl ||
    !relativePath ||
    !mimeType ||
    !name ||
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    resolvedItemId !== itemId
  ) {
    return undefined;
  }
  const response = await fetchFile(convertFileSrc(fileUrl));
  if (!response?.ok) return undefined;
  const blob = await response.blob();
  if (blob.size !== size) return undefined;
  return new File([blob], name, { type: mimeType });
}

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
    return resolveShareInboxAttachment(
      itemId,
      await plugin.resolveAttachment({ itemId }),
      {
        convertFileSrc: Capacitor.convertFileSrc,
        fetchFile: url => fetch(url),
      }
    );
  },
  async complete(itemId, docId) {
    await plugin.complete({ itemId, docId });
  },
  async setError(itemId, error) {
    await plugin.setError({ itemId, error });
  },
};
