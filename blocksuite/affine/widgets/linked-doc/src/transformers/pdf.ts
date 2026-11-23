import {
  docLinkBaseURLMiddleware,
  embedSyncedDocMiddleware,
  PdfAdapter,
  titleMiddleware,
} from '@blocksuite/affine-shared/adapters';
import type { Store } from '@blocksuite/store';

import { download } from './utils.js';

async function exportDoc(doc: Store) {
  const provider = doc.provider;
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
