import { defaultImageProxyMiddleware } from '@blocksuite/affine-block-image';
import { SpecProvider } from '@blocksuite/affine-shared/utils';
import {
  Schema,
  Transformer,
  type TransformerMiddleware,
} from '@blocksuite/store';
import { TestWorkspace } from '@blocksuite/store/test';

import { AffineSchemas } from '../../schemas.js';

declare global {
  interface Window {
    happyDOM: {
      settings: {
        fetch: {
          disableSameOriginPolicy: boolean;
        };
      };
    };
  }
}

export function createJob(middlewares?: TransformerMiddleware[]) {
  window.happyDOM.settings.fetch.disableSameOriginPolicy = true;
  const testMiddlewares = middlewares ?? [];
  testMiddlewares.push(defaultImageProxyMiddleware);
  const schema = new Schema().register(AffineSchemas);
  const docCollection = new TestWorkspace();
  docCollection.storeExtensions = SpecProvider._.getSpec('store').value;
  docCollection.meta.initialize();
  return new Transformer({
    schema,
    blobCRUD: docCollection.blobSync,
    middlewares: testMiddlewares,
    docCRUD: {
      create: (id: string) => docCollection.createDoc(id).getStore({ id }),
      get: (id: string) => docCollection.getDoc(id)?.getStore({ id }) ?? null,
      delete: (id: string) => docCollection.removeDoc(id),
    },
  });
}
