import type { ActiveDocProvider, DocProviderCreator } from '@blocksuite/store';
import { Workspace } from '@blocksuite/store';
import type { Doc } from 'yjs';

const Y = Workspace.Y;

export const createPublicCloudProvider: DocProviderCreator = (
  id,
  doc
): ActiveDocProvider => {
  let _resolve: () => void;
  let _reject: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });

  async function downloadBinaryRecursively(doc: Doc) {
    const guid = doc.guid;
    const response = await fetch(`/api/workspaces/${id}/docs/${guid}`);
    const buffer = await response.arrayBuffer();
    Y.applyUpdate(doc, new Uint8Array(buffer));
    await Promise.all([...doc.subdocs].map(downloadBinaryRecursively));
  }

  return {
    flavour: 'affine-cloud-download',
    active: true,
    sync() {
      downloadBinaryRecursively(doc).then(_resolve).catch(_reject);
    },
    get whenReady() {
      return promise;
    },
  };
};
