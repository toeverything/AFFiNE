import {
  docLinkBaseURLMiddleware,
  embedSyncedDocMiddleware,
  PdfAdapter,
  titleMiddleware,
} from '@blocksuite/affine-shared/adapters';
import type { ServiceProvider } from '@blocksuite/global/di';
import type { Store } from '@blocksuite/store';

import { download } from './utils.js';

// Pass `std.provider` so the export can fall back to the editor's font config.
async function exportDoc(doc: Store, provider: ServiceProvider = doc.provider) {
  const job = doc.getTransformer([
    docLinkBaseURLMiddleware(doc.workspace.id),
    titleMiddleware(doc.workspace.meta.docMetas),
    embedSyncedDocMiddleware('content'),
  ]);
  const snapshot = job.docToSnapshot(doc);
  if (!snapshot) {
    return;
  }
  const adapter = new PdfAdapter(job, provider);
  const { file } = await adapter.fromDocSnapshot({
    snapshot,
    assets: job.assetsManager,
  });
  download(file.blob, file.fileName);
}

export const PdfTransformer = {
  exportDoc,
};
