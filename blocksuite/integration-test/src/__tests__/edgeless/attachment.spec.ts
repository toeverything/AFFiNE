import type { EdgelessRootBlockComponent } from '@blocksuite/affine/blocks/root';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { getDocRootBlock } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

async function waitForElement<T extends Element>(
  query: () => T | null | undefined,
  timeout = 5000
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const element = query();
    if (element) return element;
    await wait(50);
  }
  return null;
}

describe('attachment video embed in edgeless', () => {
  let service: EdgelessRootBlockComponent['service'];

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');
    service = getDocRootBlock(doc, editor, 'edgeless').service;
    return cleanup;
  });

  test('keeps the aspect ratio of its bound and does not crop the video', async () => {
    const blob = new Blob([new Uint8Array(16)], { type: 'video/mp4' });
    const sourceId = await doc.blobSync.set(blob);
    const id = service.crud.addBlock(
      'affine:attachment',
      {
        name: 'clip.mp4',
        type: 'video/mp4',
        size: blob.size,
        sourceId,
        embed: true,
        style: 'video',
        xywh: '[0, 0, 376, 211.5]',
        index: service.generateIndex(),
      },
      service.surface.id
    );

    const video = await waitForElement(() =>
      editor.host?.view.getBlock(id)?.querySelector('video')
    );
    expect(video).toBeInstanceOf(HTMLVideoElement);
    expect(video!.style.objectFit).toBe('contain');

    const container = video!.closest<HTMLElement>(
      '.affine-attachment-container'
    );
    expect(container!.style.width).toBe('752px');
    expect(container!.style.height).toBe('423px');
    expect(container!.style.transform).toBe('scale(0.5)');
  });
});
