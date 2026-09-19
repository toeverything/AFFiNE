import {
  docLinkBaseURLMiddleware,
  embedSyncedDocMiddleware,
  MarkdownAdapterFactoryIdentifier,
  titleMiddleware,
} from '@blocksuite/affine/shared/adapters';
import type { BlockStdScope } from '@blocksuite/affine/std';
import { type Store, Transformer } from '@blocksuite/affine/store';

import { getAFFiNEWorkspaceSchema } from '../../workspace';

type MarkdownAdapterResult = {
  file?: string;
};

export async function exportDocToMarkdown(doc: Store, std: BlockStdScope) {
  const transformer = new Transformer({
    schema: getAFFiNEWorkspaceSchema(),
    blobCRUD: doc.workspace.blobSync,
    docCRUD: {
      create: (id: string) => doc.workspace.createDoc(id).getStore({ id }),
      get: (id: string) => doc.workspace.getDoc(id)?.getStore({ id }) ?? null,
      delete: (id: string) => doc.workspace.removeDoc(id),
    },
    middlewares: [
      docLinkBaseURLMiddleware(doc.workspace.id),
      titleMiddleware(doc.workspace.meta.docMetas),
      embedSyncedDocMiddleware('content'),
    ],
  });
  const adapterFactory = std.store.provider.get(
    MarkdownAdapterFactoryIdentifier
  );
  const adapter = adapterFactory.get(transformer);
  const result = (await adapter.fromDoc(doc)) as MarkdownAdapterResult;
  return result.file ?? '';
}
