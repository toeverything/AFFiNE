import type { FrameBlockComponent } from '@blocksuite/affine/blocks/frame';
import type { EdgelessRootBlockComponent } from '@blocksuite/affine/blocks/root';
import type { FrameBlockModel } from '@blocksuite/affine/model';
import type { AffineFrameTitleWidget } from '@blocksuite/affine/widgets/frame-title';
import { OverlayIdentifier } from '@blocksuite/affine-block-surface';
import type { ConnectionOverlay } from '@blocksuite/affine-gfx-connector';
import type { IVec } from '@blocksuite/global/gfx';
import { assertType } from '@blocksuite/global/utils';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { getDocRootBlock } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('frame', () => {
  let service!: EdgelessRootBlockComponent['service'];

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');
    service = getDocRootBlock(window.doc, window.editor, 'edgeless').service;

    return cleanup;
  });

  test('frame should have title', async () => {
    const frame = service.doc.addBlock(
      'affine:frame',
      {
        xywh: '[0,0,300,300]',
        title: new Text('Frame 1'),
      },
      service.surface.id
    );
    await wait();

    const getFrameTitle = (frameId: string) => {
      const frameTitleWidget = service.std.view.getWidget(
        'affine-frame-title-widget',
        frameId
      ) as AffineFrameTitleWidget | null;
      return frameTitleWidget?.shadowRoot?.querySelector('affine-frame-title');
    };

    const frameTitle = getFrameTitle(frame);
    const rect = frameTitle?.getBoundingClientRect();

    expect(frameTitle).toBeTruthy();
    expect(rect).toBeTruthy();
    expect(rect!.width).toBeGreaterThan(0);
    expect(rect!.height).toBeGreaterThan(0);

    const [titleX, titleY] = service.viewport.toModelCoordFromClientCoord([
      rect!.x,
      rect!.y,
    ]);
    expect(titleX).toBeCloseTo(0);
    expect(titleY).toBeLessThan(0);

    const nestedFrame = service.doc.addBlock(
      'affine:frame',
      {
        xywh: '[20,20,200,200]',
        title: new Text('Frame 2'),
      },
      service.surface.id
    );
    await wait();

    const nestedTitle = getFrameTitle(nestedFrame);
    expect(nestedTitle).toBeTruthy();
    if (!nestedTitle) return;

    const nestedTitleRect = nestedTitle.getBoundingClientRect()!;
    const [nestedTitleX, nestedTitleY] =
      service.viewport.toModelCoordFromClientCoord([
        nestedTitleRect.x,
        nestedTitleRect.y,
      ]);

    expect(nestedTitleX).toBeGreaterThan(20);
    expect(nestedTitleY).toBeGreaterThan(20);
  });

  test('frame should have externalXYWH after moving viewport to contains frame', async () => {
    const frameId = service.doc.addBlock(
      'affine:frame',
      {
        xywh: '[1800,1800,200,200]',
        title: new Text('Frame 1'),
      },
      service.surface.id
    );
    await wait();

    const frame = service.doc.getBlock(frameId);
    expect(frame).toBeTruthy();

    assertType<FrameBlockComponent>(frame);

    service.viewport.setCenter(900, 900);
    expect(frame?.model.externalXYWH).toBeDefined();
  });

  test('descendant of frame should not contain itself', async () => {
    const frameIds = [1, 2, 3].map(i => {
      return service.doc.addBlock(
        'affine:frame',
        {
          xywh: '[0,0,300,300]',
          title: new Text(`Frame ${i}`),
        },
        service.surface.id
      );
    });

    await wait();

    const frames = frameIds.map(
      id => service.doc.getBlock(id)?.model as FrameBlockModel
    );

    frames.forEach(frame => {
      expect(frame.descendantElements).toHaveLength(0);
    });

    frames[0].addChild(frames[1]);
    frames[1].addChild(frames[2]);
    frames[2].addChild(frames[0]);

    await wait();
    expect(frames[0].descendantElements).toHaveLength(2);
    expect(frames[1].descendantElements).toHaveLength(1);
    expect(frames[2].descendantElements).toHaveLength(0);
  });

  test.each<{ name: string; point: IVec; target?: 'frame' | 'shape' }>([
    { name: 'stays free inside a frame', point: [60, 200] },
    { name: 'attaches to the frame border', point: [0, 200], target: 'frame' },
    {
      name: 'attaches to a shape in a frame',
      point: [200, 200],
      target: 'shape',
    },
  ])('connector endpoint $name', async ({ point, target }) => {
    const frame = service.doc.addBlock(
      'affine:frame',
      { xywh: '[0,0,400,400]', title: new Text('Frame') },
      service.surface.id
    );
    const shape = service.crud.addElement('shape', {
      shapeType: 'rect',
      xywh: '[150,150,100,100]',
    })!;
    service.viewport.setCenter(200, 200);
    await wait();

    const overlay = service.std.get(
      OverlayIdentifier('connection')
    ) as ConnectionOverlay;
    const connection = overlay.renderConnector(point);

    const ids = { frame, shape };
    expect(connection.id).toBe(target && ids[target]);
  });
});
