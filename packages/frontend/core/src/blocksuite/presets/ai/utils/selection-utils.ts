import type { EditorHost } from '@blocksuite/block-std';
import {
  type CopilotSelectionController,
  type FrameBlockModel,
  ImageBlockModel,
  type SurfaceBlockComponent,
} from '@blocksuite/blocks';
import { BlocksUtils, EdgelessRootService } from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import {
  type BlockModel,
  type DraftModel,
  Slice,
  toDraftModel,
} from '@blocksuite/store';

import { getContentFromSlice } from '../../_common';
import { getEdgelessCopilotWidget, getService } from './edgeless';

export const getRootService = (host: EditorHost) => {
  return host.std.getService('affine:page');
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
  const rootService = editor.std.getService('affine:page');
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
    edgelessRoot.service.frame.getElementsInFrameBound(frame, true)
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

export function getSelectedModels(editorHost: EditorHost) {
  const chain = editorHost.std.command.chain();
  const [_, ctx] = chain
    .getSelectedModels({
      types: ['block', 'text'],
    })
    .run();
  const { selectedModels } = ctx;
  return selectedModels;
}

function traverse(model: DraftModel, drafts: DraftModel[]) {
  const isDatabase = model.flavour === 'affine:database';
  const children = isDatabase
    ? model.children
    : model.children.filter(child => {
        const idx = drafts.findIndex(m => m.id === child.id);
        return idx >= 0;
      });

  children.forEach(child => {
    const idx = drafts.findIndex(m => m.id === child.id);
    if (idx >= 0) {
      drafts.splice(idx, 1);
    }
    traverse(child, drafts);
  });
  model.children = children;
}

export async function getTextContentFromBlockModels(
  editorHost: EditorHost,
  models: BlockModel[],
  type: 'markdown' | 'plain-text' = 'markdown'
) {
  // Currently only filter out images and databases
  const selectedTextModels = models.filter(
    model =>
      !BlocksUtils.matchFlavours(model, ['affine:image', 'affine:database'])
  );
  const drafts = selectedTextModels.map(toDraftModel);
  drafts.forEach(draft => traverse(draft, drafts));
  const slice = Slice.fromModels(editorHost.std.doc, drafts);
  return getContentFromSlice(editorHost, slice, type);
}

export async function getSelectedTextContent(
  editorHost: EditorHost,
  type: 'markdown' | 'plain-text' = 'markdown'
) {
  const selectedModels = getSelectedModels(editorHost);
  assertExists(selectedModels);
  return getTextContentFromBlockModels(editorHost, selectedModels, type);
}

export async function selectAboveBlocks(editorHost: EditorHost, num = 10) {
  let selectedModels = getSelectedModels(editorHost);
  assertExists(selectedModels);

  const lastLeafModel = selectedModels[selectedModels.length - 1];

  let noteModel: BlockModel | null = lastLeafModel;
  let lastRootModel: BlockModel | null = null;
  while (noteModel && noteModel.flavour !== 'affine:note') {
    lastRootModel = noteModel;
    noteModel = editorHost.doc.getParent(noteModel);
  }
  assertExists(noteModel);
  assertExists(lastRootModel);

  const endIndex = noteModel.children.indexOf(lastRootModel) + 1;
  const startIndex = Math.max(0, endIndex - num);
  const startBlock = noteModel.children[startIndex];

  selectedModels = [];
  let stop = false;
  const traverse = (model: BlockModel): void => {
    if (stop) return;

    selectedModels.push(model);

    if (model === lastLeafModel) {
      stop = true;
      return;
    }

    model.children.forEach(child => traverse(child));
  };
  noteModel.children.slice(startIndex, endIndex).forEach(traverse);

  const { selection } = editorHost;
  selection.set([
    selection.create('text', {
      from: {
        blockId: startBlock.id,
        index: 0,
        length: startBlock.text?.length ?? 0,
      },
      to: {
        blockId: lastLeafModel.id,
        index: 0,
        length: selection.find('text')?.from.index ?? 0,
      },
    }),
  ]);

  return getTextContentFromBlockModels(editorHost, selectedModels);
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
  const elements = edgelessRoot.service.frame.getElementsInFrameBound(
    frame,
    false
  );
  const image = elements.find(ele => {
    if (!BlocksUtils.isCanvasElement(ele)) {
      return ele.flavour === 'affine:image';
    }
    return false;
  }) as ImageBlockModel | undefined;
  return image?.id;
};

export const getSelections = (
  host: EditorHost,
  mode: 'flat' | 'highest' = 'flat'
) => {
  const [_, data] = host.command
    .chain()
    .tryAll(chain => [
      chain.getTextSelection(),
      chain.getBlockSelections(),
      chain.getImageSelections(),
    ])
    .getSelectedBlocks({ types: ['text', 'block', 'image'], mode })
    .run();

  return data;
};

export const getSelectedImagesAsBlobs = async (host: EditorHost) => {
  const [_, data] = host.command
    .chain()
    .tryAll(chain => [
      chain.getTextSelection(),
      chain.getBlockSelections(),
      chain.getImageSelections(),
    ])
    .getSelectedBlocks({
      types: ['block', 'image'],
    })
    .run();

  const blobs = await Promise.all(
    data.selectedBlocks?.map(async b => {
      const sourceId = (b.model as ImageBlockModel).sourceId;
      if (!sourceId) return null;
      const blob = await host.doc.blobSync.get(sourceId);
      if (!blob) return null;
      return new File([blob], sourceId);
    }) ?? []
  );
  return blobs.filter((blob): blob is File => !!blob);
};

export const getSelectedNoteAnchor = (host: EditorHost, id: string) => {
  return host.querySelector(`[data-portal-block-id="${id}"] .note-background`);
};

export function getCopilotSelectedElems(
  host: EditorHost
): BlockSuite.EdgelessModel[] {
  const service = getService(host);
  const copilotWidget = getEdgelessCopilotWidget(host);

  if (copilotWidget.visible) {
    return (service.tool.controllers['copilot'] as CopilotSelectionController)
      .selectedElements;
  }

  return service.selection.selectedElements;
}

export const imageCustomInput = async (host: EditorHost) => {
  const selectedElements = getCopilotSelectedElems(host);
  if (selectedElements.length !== 1) return;

  const imageBlock = selectedElements[0];
  if (!(imageBlock instanceof ImageBlockModel)) return;
  if (!imageBlock.sourceId) return;

  const blob = await host.doc.blobSync.get(imageBlock.sourceId);
  if (!blob) return;

  return {
    attachments: [blob],
  };
};
