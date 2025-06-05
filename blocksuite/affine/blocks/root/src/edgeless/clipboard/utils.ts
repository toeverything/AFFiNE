import {
  EdgelessFrameManager,
  EdgelessFrameManagerIdentifier,
} from '@blocksuite/affine-block-frame';
import type { FrameBlockProps } from '@blocksuite/affine-model';
import { encodeClipboardBlobs } from '@blocksuite/affine-shared/adapters';
import { Bound, getBoundWithRotation } from '@blocksuite/global/gfx';
import type { BlockStdScope } from '@blocksuite/std';
import {
  generateKeyBetweenV2,
  type GfxModel,
  type SerializedElement,
} from '@blocksuite/std/gfx';
import { type BlockSnapshot, BlockSnapshotSchema } from '@blocksuite/store';
import DOMPurify from 'dompurify';

import { serializeElement } from '../utils/clone-utils';
import { isAttachmentBlock, isImageBlock } from '../utils/query';

type FrameSnapshot = BlockSnapshot & {
  props: FrameBlockProps;
};

export function createNewPresentationIndexes(
  raw: (SerializedElement | BlockSnapshot)[],
  std: BlockStdScope
) {
  const frames = raw
    .filter((block): block is FrameSnapshot => {
      const { data } = BlockSnapshotSchema.safeParse(block);
      return data?.flavour === 'affine:frame';
    })
    .sort((a, b) => EdgelessFrameManager.framePresentationComparator(a, b));

  const frameMgr = std.get(EdgelessFrameManagerIdentifier);
  let before = frameMgr.generatePresentationIndex();
  const result = new Map<string, string>();
  frames.forEach(frame => {
    result.set(frame.id, before);
    before = generateKeyBetweenV2(before, null);
  });

  return result;
}

export async function prepareClipboardData(
  selectedAll: GfxModel[],
  std: BlockStdScope
) {
  const job = std.store.getTransformer();
  const selected = await Promise.all(
    selectedAll.map(async selected => {
      const data = serializeElement(selected, selectedAll, job);
      if (!data) {
        return;
      }
      if (isAttachmentBlock(selected) || isImageBlock(selected)) {
        await job.assetsManager.readFromBlob(data.props.sourceId as string);
      }
      return data;
    })
  );
  const blobs = await encodeClipboardBlobs(job.assetsManager.getAssets());
  return {
    snapshot: selected.filter(d => !!d),
    blobs,
  };
}

export function isPureFileInClipboard(clipboardData: DataTransfer) {
  const types = clipboardData.types;
  const allowedTypes = new Set([
    'Files',
    'text/plain',
    'text/html',
    'application/x-moz-file',
  ]);

  return types.includes('Files') && types.every(type => allowedTypes.has(type));
}

export function tryGetSvgFromClipboard(clipboardData: DataTransfer) {
  try {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(
      clipboardData.getData('text/plain'),
      'image/svg+xml'
    );
    const svg = svgDoc.documentElement;

    if (svg.tagName !== 'svg' || !svg.hasAttribute('xmlns')) {
      return null;
    }
    const svgContent = DOMPurify.sanitize(svgDoc.documentElement, {
      USE_PROFILES: { svg: true },
    });
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const file = new File([blob], 'pasted-image.svg', {
      type: 'image/svg+xml',
    });
    return file;
  } catch {
    return null;
  }
}

export function edgelessElementsBoundFromRawData(
  elementsRawData: (SerializedElement | BlockSnapshot)[]
) {
  if (elementsRawData.length === 0) return new Bound();

  let prev: Bound | null = null;

  for (const data of elementsRawData) {
    const { data: blockSnapshot } = BlockSnapshotSchema.safeParse(data);
    const bound = blockSnapshot
      ? getBoundFromGfxBlockSnapshot(blockSnapshot)
      : getBoundFromSerializedElement(data as SerializedElement);

    if (!bound) continue;
    if (!prev) prev = bound;
    else prev = prev.unite(bound);
  }

  return prev ?? new Bound();
}

function getBoundFromSerializedElement(element: SerializedElement) {
  return Bound.from(
    getBoundWithRotation({
      ...Bound.deserialize(element.xywh),
      rotate: typeof element.rotate === 'number' ? element.rotate : 0,
    })
  );
}

function getBoundFromGfxBlockSnapshot(snapshot: BlockSnapshot) {
  if (typeof snapshot.props.xywh !== 'string') return null;
  return Bound.deserialize(snapshot.props.xywh);
}
