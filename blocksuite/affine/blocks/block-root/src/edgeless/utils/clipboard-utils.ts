import {
  EdgelessFrameManager,
  EdgelessFrameManagerIdentifier,
  isFrameBlock,
} from '@blocksuite/affine-block-frame';
import { isNoteBlock } from '@blocksuite/affine-block-surface';
import type {
  EdgelessTextBlockModel,
  EmbedSyncedDocModel,
  FrameBlockModel,
  FrameBlockProps,
  ImageBlockModel,
  NoteBlockModel,
  ShapeElementModel,
} from '@blocksuite/affine-model';
import { getElementsWithoutGroup } from '@blocksuite/affine-shared/utils';
import type { BlockComponent } from '@blocksuite/block-std';
import {
  generateKeyBetweenV2,
  type GfxModel,
  type SerializedElement,
} from '@blocksuite/block-std/gfx';
import { getCommonBoundWithRotation } from '@blocksuite/global/gfx';
import { type BlockSnapshot, BlockSnapshotSchema } from '@blocksuite/store';
import groupBy from 'lodash-es/groupBy';

import type { EdgelessRootBlockComponent } from '../edgeless-root-block.js';
import { getSortedCloneElements, prepareCloneData } from './clone-utils.js';
import {
  isEdgelessTextBlock,
  isEmbedSyncedDocBlock,
  isImageBlock,
} from './query.js';

const offset = 10;
export async function duplicate(
  edgeless: EdgelessRootBlockComponent,
  elements: GfxModel[],
  select = true
) {
  const { clipboardController } = edgeless;
  const copyElements = getSortedCloneElements(elements);
  const totalBound = getCommonBoundWithRotation(copyElements);
  totalBound.x += totalBound.w + offset;

  const snapshot = prepareCloneData(copyElements, edgeless.std);
  const { canvasElements, blockModels } =
    await clipboardController.createElementsFromClipboardData(
      snapshot,
      totalBound.center
    );

  const newElements = [...canvasElements, ...blockModels];

  edgeless.surface.fitToViewport(totalBound);

  if (select) {
    edgeless.service.selection.set({
      elements: newElements.map(e => e.id),
      editing: false,
    });
  }
}
export const splitElements = (elements: GfxModel[]) => {
  const { notes, frames, shapes, images, edgelessTexts, embedSyncedDocs } =
    groupBy(getElementsWithoutGroup(elements), element => {
      if (isNoteBlock(element)) {
        return 'notes';
      } else if (isFrameBlock(element)) {
        return 'frames';
      } else if (isImageBlock(element)) {
        return 'images';
      } else if (isEdgelessTextBlock(element)) {
        return 'edgelessTexts';
      } else if (isEmbedSyncedDocBlock(element)) {
        return 'embedSyncedDocs';
      }
      return 'shapes';
    }) as {
      notes: NoteBlockModel[];
      shapes: ShapeElementModel[];
      frames: FrameBlockModel[];
      images: ImageBlockModel[];
      edgelessTexts: EdgelessTextBlockModel[];
      embedSyncedDocs: EmbedSyncedDocModel[];
    };

  return {
    notes: notes ?? [],
    shapes: shapes ?? [],
    frames: frames ?? [],
    images: images ?? [],
    edgelessTexts: edgelessTexts ?? [],
    embedSyncedDocs: embedSyncedDocs ?? [],
  };
};

type FrameSnapshot = BlockSnapshot & {
  props: FrameBlockProps;
};

export function createNewPresentationIndexes(
  raw: (SerializedElement | BlockSnapshot)[],
  edgeless: BlockComponent
) {
  const frames = raw
    .filter((block): block is FrameSnapshot => {
      const { data } = BlockSnapshotSchema.safeParse(block);
      return data?.flavour === 'affine:frame';
    })
    .sort((a, b) => EdgelessFrameManager.framePresentationComparator(a, b));

  const frameMgr = edgeless.std.get(EdgelessFrameManagerIdentifier);
  let before = frameMgr.generatePresentationIndex();
  const result = new Map<string, string>();
  frames.forEach(frame => {
    result.set(frame.id, before);
    before = generateKeyBetweenV2(before, null);
  });

  return result;
}
