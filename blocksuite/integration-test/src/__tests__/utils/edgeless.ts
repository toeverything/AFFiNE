import type {
  EdgelessRootBlockComponent,
  PageRootBlockComponent,
} from '@blocksuite/affine/blocks/root';
import type { SurfaceBlockComponent } from '@blocksuite/affine/blocks/surface';
import type { Store } from '@blocksuite/store';

import type { TestAffineEditorContainer } from '../../index.js';

export function getSurface(doc: Store, editor: TestAffineEditorContainer) {
  const surfaceModel = doc.getModelsByFlavour('affine:surface');

  return editor.host!.view.getBlock(
    surfaceModel[0]!.id
  ) as SurfaceBlockComponent;
}

export function getDocRootBlock(
  doc: Store,
  editor: TestAffineEditorContainer,
  mode: 'page'
): PageRootBlockComponent;
export function getDocRootBlock(
  doc: Store,
  editor: TestAffineEditorContainer,
  mode: 'edgeless'
): EdgelessRootBlockComponent;
export function getDocRootBlock(
  doc: Store,
  editor: TestAffineEditorContainer,
  _?: 'edgeless' | 'page'
) {
  return editor.host!.view.getBlock(doc.root!.id) as
    | EdgelessRootBlockComponent
    | PageRootBlockComponent;
}

export function addNote(doc: Store, props: Record<string, any> = {}) {
  const noteId = doc.addBlock(
    'affine:note',
    {
      xywh: '[0, 0, 800, 100]',
      ...props,
    },
    doc.root
  );

  doc.addBlock('affine:paragraph', {}, noteId);

  return noteId;
}
