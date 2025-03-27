import type { EditorHost } from '@blocksuite/affine/block-std';
import type * as Effects from '@blocksuite/affine/effects';
import type * as ConnectorToolEffect from '@blocksuite/affine/gfx/connector';
import type * as ShapeToolEffect from '@blocksuite/affine/gfx/shape';
import type { Store, Transformer, Workspace } from '@blocksuite/affine/store';
import type { TestAffineEditorContainer } from '@blocksuite/integration-test';

declare const _GLOBAL_:
  | typeof Effects
  | typeof ConnectorToolEffect
  | typeof ShapeToolEffect;

declare global {
  interface Window {
    /** Available on playground window
     * the following instance are initialized in `packages/playground/apps/starter/main.ts`
     */
    $blocksuite: {
      store: typeof import('@blocksuite/affine/store');
      blocks: {
        database: typeof import('@blocksuite/affine/blocks/database');
        note: typeof import('@blocksuite/affine/blocks/note');
      };
      global: {
        utils: typeof import('@blocksuite/affine/global/utils');
      };
      services: typeof import('@blocksuite/affine/shared/services');
      editor: typeof import('@blocksuite/integration-test');
      blockStd: typeof import('@blocksuite/affine/block-std');
    };
    collection: Workspace;
    doc: Store;
    editor: TestAffineEditorContainer;
    host: EditorHost;
    job: Transformer;
  }
}
