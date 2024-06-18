import type { EditorHost } from '@blocksuite/block-std';
import {
  BlocksUtils,
  EdgelessRootService,
  type FrameBlockModel,
  type ImageBlockModel,
  type SurfaceBlockComponent,
} from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import { Slice } from '@blocksuite/store';

import { getMarkdownFromSlice } from './markdown-utils.js';

export const getRootService = (host: EditorHost) => {
  return host.std.spec.getService('affine:page');
};

export function getEdgelessRootFromEditor(editor: EditorHost) {
  const edgelessRoot = editor.getElementsByTagName('affine-edgeless-root')[0];
  if (!edgelessRoot) {
    alert('Please switch to edgeless mode');
    throw new Error('Please open switch to edgeless mode');
  }
  return edgelessRoot;
}
export function getEdgelessService(editor: EditorHost) {
  const rootService = editor.std.spec.getService('affine:page');
  if (rootService instanceof EdgelessRootService) {
    return rootService;
  }
  alert('Please switch to edgeless mode');
  throw new Error('Please open switch to edgeless mode');
}

export async function selectedToCanvas(editor: EditorHost) {
  const edgelessRoot = getEdgelessRootFromEditor(editor);
  const { notes, frames, shapes, images } = BlocksUtils.splitElements(
    edgelessRoot.service.selection.selectedElements
  );
  if (notes.length + frames.length + images.length + shapes.length === 0) {
    return;
  }
  const canvas = await edgelessRoot.clipboardController.toCanvas(
    [...notes, ...frames, ...images],
    shapes
  );
  if (!canvas) {
    return;
  }
  return canvas;
}

export async function frameToCanvas(
  frame: FrameBlockModel,
  editor: EditorHost
) {
  const edgelessRoot = getEdgelessRootFromEditor(editor);
  const { notes, frames, shapes, images } = BlocksUtils.splitElements(
    edgelessRoot.service.frame.getElementsInFrame(frame, true)
  );
  if (notes.length + frames.length + images.length + shapes.length === 0) {
    return;
  }
  const canvas = await edgelessRoot.clipboardController.toCanvas(
    [...notes, ...frames, ...images],
    shapes
  );
  if (!canvas) {
    return;
  }
  return canvas;
}

export async function selectedToPng(editor: EditorHost) {
  return (await selectedToCanvas(editor))?.toDataURL('image/png');
}

export async function getSelectedTextContent(editorHost: EditorHost) {
  const slice = Slice.fromModels(
    editorHost.std.doc,
    getRootService(editorHost).selectedModels
  );
  return getMarkdownFromSlice(editorHost, slice);
}

export const stopPropagation = (e: Event) => {
  e.stopPropagation();
};

export function getSurfaceElementFromEditor(editor: EditorHost) {
  const { doc } = editor;
  const surfaceModel = doc.getBlockByFlavour('affine:surface')[0];
  assertExists(surfaceModel);

  const surfaceId = surfaceModel.id;
  const surfaceElement = editor.querySelector(
    `affine-surface[data-block-id="${surfaceId}"]`
  ) as SurfaceBlockComponent;
  assertExists(surfaceElement);

  return surfaceElement;
}

export const getFirstImageInFrame = (
  frame: FrameBlockModel,
  editor: EditorHost
) => {
  const edgelessRoot = getEdgelessRootFromEditor(editor);
  const elements = edgelessRoot.service.frame.getElementsInFrame(frame, false);
  const image = elements.find(ele => {
    if (!BlocksUtils.isCanvasElement(ele)) {
      return ele.flavour === 'affine:image';
    }
    return false;
  }) as ImageBlockModel | undefined;
  return image?.id;
};
