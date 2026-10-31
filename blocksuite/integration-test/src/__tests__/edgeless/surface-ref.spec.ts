import {
  type EdgelessRootBlockComponent,
  EdgelessRootService,
} from '@blocksuite/affine/blocks/root';
import type { DocSnapshot } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote, getDocRootBlock } from '../utils/edgeless.js';
import { importFromSnapshot } from '../utils/misc.js';
import { setupEditor } from '../utils/setup.js';

describe('basic', () => {
  let service: EdgelessRootBlockComponent['service'];
  let edgelessRoot: EdgelessRootBlockComponent;
  let noteAId = '';
  let noteBId = '';
  let shapeAId = '';
  let shapeBId = '';
  let frameId = '';

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');
    edgelessRoot = getDocRootBlock(doc, editor, 'edgeless');
    service = edgelessRoot.service;

    noteAId = addNote(doc, {
      index: service.generateIndex(),
    });
    shapeAId = service.crud.addElement('shape', {
      type: 'rect',
      xywh: '[0, 0, 100, 100]',
      index: service.generateIndex(),
    })!;
    noteBId = addNote(doc, {
      index: service.generateIndex(),
    });
    shapeBId = service.crud.addElement('shape', {
      type: 'rect',
      xywh: '[100, 0, 100, 100]',
      index: service.generateIndex(),
    })!;
    await wait(0); // wait next frame
    frameId = service.crud.addBlock(
      'affine:frame',
      {
        xywh: '[0, 0, 800, 200]',
        index: service.generateIndex(),
      },
      service.surface.id
    );

    return cleanup;
  });

  test('surface-ref should be rendered in page mode', async () => {
    const surfaceRefId = doc.addBlock(
      'affine:surface-ref',
      {
        reference: frameId,
        refFlavour: 'affine:frame',
      },
      noteAId
    );

    editor.mode = 'page';
    await wait();

    expect(
      document.querySelector(
        `affine-surface-ref[data-block-id="${surfaceRefId}"]`
      )
    ).instanceOf(Element);
  });

  test('content in frame should be rendered in the correct order', async () => {
    const surfaceRefId = doc.addBlock(
      'affine:surface-ref',
      {
        reference: frameId,
        refFlavour: 'affine:frame',
      },
      noteAId
    );

    editor.mode = 'page';
    await wait();

    const surfaceRef = document.querySelector(
      `affine-surface-ref[data-block-id="${surfaceRefId}"]`
    ) as HTMLElement;
    const refBlocks = Array.from(
      surfaceRef.querySelectorAll('affine-edgeless-note')
    ) as HTMLElement[];
    const stackingCanvas = Array.from(
      surfaceRef.querySelectorAll('.indexable-canvas')!
    ) as HTMLCanvasElement[];

    expect(refBlocks.length).toBe(2);
    expect(stackingCanvas.length).toBe(2);
    expect(stackingCanvas[0].style.zIndex > refBlocks[0].style.zIndex).toBe(
      true
    );
  });

  test('content in group should be rendered in the correct order', async () => {
    const groupId = service.crud.addElement('group', {
      children: {
        [shapeAId]: true,
        [shapeBId]: true,
        [noteAId]: true,
        [noteBId]: true,
      },
    });
    const surfaceRefId = doc.addBlock(
      'affine:surface-ref',
      {
        reference: groupId,
        refFlavour: 'group',
      },
      noteAId
    );

    editor.mode = 'page';
    await wait();

    const surfaceRef = document.querySelector(
      `affine-surface-ref[data-block-id="${surfaceRefId}"]`
    ) as HTMLElement;
    const refBlocks = Array.from(
      surfaceRef.querySelectorAll('affine-edgeless-note')
    ) as HTMLElement[];
    const stackingCanvas = Array.from(
      surfaceRef.querySelectorAll('.indexable-canvas')
    ) as HTMLCanvasElement[];

    expect(refBlocks.length).toBe(2);
    expect(stackingCanvas.length).toBe(2);
    expect(stackingCanvas[1].style.zIndex > refBlocks[0].style.zIndex).toBe(
      true
    );
  });

  test('frame should be rendered in surface-ref viewport', async () => {
    const surfaceRefId = doc.addBlock(
      'affine:surface-ref',
      {
        reference: frameId,
        refFlavour: 'affine:frame',
      },
      noteAId
    );

    editor.mode = 'page';
    await wait();

    const surfaceRef = document.querySelector(
      `affine-surface-ref[data-block-id="${surfaceRefId}"]`
    ) as SurfaceRefBlockComponent;

    const edgeless = surfaceRef.previewEditor!.std.get(EdgelessRootService);

    const frame = surfaceRef.querySelector(
      'affine-frame'
    ) as FrameBlockComponent;

    expect(
      edgeless.viewport.isInViewport(frame.model.elementBound)
    ).toBeTruthy();
  });

  test('group should be rendered in surface-ref viewport', async () => {
    const groupId = service.crud.addElement('group', {
      children: {
        [shapeAId]: true,
        [shapeBId]: true,
        [noteAId]: true,
        [noteBId]: true,
      },
    })!;
    const surfaceRefId = doc.addBlock(
      'affine:surface-ref',
      {
        reference: groupId,
        refFlavour: 'group',
      },
      noteAId
    );

    editor.mode = 'page';
    await wait();

    const surfaceRef = document.querySelector(
      `affine-surface-ref[data-block-id="${surfaceRefId}"]`
    ) as SurfaceRefBlockComponent;

    const edgeless = surfaceRef.previewEditor!.std.get(EdgelessRootService);

    const group = edgeless.crud.getElementById(groupId)!;

    expect(edgeless.viewport.isInViewport(group.elementBound)).toBeTruthy();
  });

  test('viewport of surface-ref should be updated when the reference xywh updated', async () => {
    const surfaceRefId = doc.addBlock(
      'affine:surface-ref',
      {
        reference: frameId,
        refFlavour: 'affine:frame',
      },
      noteAId
    );

    editor.mode = 'page';
    await wait();

    const surfaceRef = document.querySelector(
      `affine-surface-ref[data-block-id="${surfaceRefId}"]`
    ) as SurfaceRefBlockComponent;

    const edgeless = surfaceRef.previewEditor!.std.get(EdgelessRootService);

    const frame = surfaceRef.querySelector(
      'affine-frame'
    ) as FrameBlockComponent;

    const oldViewport = edgeless.viewport.viewportBounds;

    frame.model.xywh = '[100, 100, 800, 200]';
    await wait();

    expect(edgeless.viewport.viewportBounds).not.toEqual(oldViewport);
  });

  test('view in edgeless mode button', async () => {
    const groupId = service.crud.addElement('group', {
      children: {
        [shapeAId]: true,
        [shapeBId]: true,
        [noteAId]: true,
        [noteBId]: true,
      },
    });
    const surfaceRefId = doc.addBlock(
      'affine:surface-ref',
      {
        reference: groupId,
        refFlavour: 'group',
      },
      noteAId
    );

    editor.mode = 'page';
    await wait();

    const surfaceRef = document.querySelector(
      `affine-surface-ref[data-block-id="${surfaceRefId}"]`
    ) as HTMLElement;

    expect(surfaceRef).instanceOf(Element);
    (surfaceRef as SurfaceRefBlockComponent).viewInEdgeless();
    await wait();
  });
});

describe('frame referenced across pages (cross-doc)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  function createSecondDocWithFrame() {
    const secondDoc = collection
      .createDoc(`doc:second-${Math.random().toString(16).slice(2, 8)}`)
      .getStore();
    let frameId = '';
    secondDoc.load(() => {
      const rootId = secondDoc.addBlock('affine:page', { title: new Text() });
      const surfaceId = secondDoc.addBlock('affine:surface', {}, rootId);
      frameId = secondDoc.addBlock(
        'affine:frame',
        { xywh: '[0, 0, 800, 200]', title: new Text('Second Frame') },
        surfaceId
      );
    });
    return { secondDoc, frameId };
  }

  test('insertSurfaceRefBlockCommand creates a cross-doc reference that resolves against the source doc', async () => {
    const { secondDoc, frameId } = createSecondDocWithFrame();

    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);

    const [success, result] = editor.std.command.exec(
      insertSurfaceRefBlockCommand,
      {
        reference: frameId,
        refDocId: secondDoc.id,
        refFlavour: 'affine:frame',
        place: 'after',
        selectedModels: [doc.getModelById(paragraphId)!],
      }
    );
    await wait();

    expect(success).toBeTruthy();
    expect(result.insertedSurfaceRefBlockId).toBeTruthy();

    const refModel = doc.getBlock(result.insertedSurfaceRefBlockId!)!
      .model as SurfaceRefBlockModel;
    expect(refModel.props.reference).toBe(frameId);
    expect(refModel.props.refDocId).toBe(secondDoc.id);

    editor.mode = 'page';
    await wait();

    const refEl = document.querySelector(
      `affine-surface-ref[data-block-id="${result.insertedSurfaceRefBlockId}"]`
    ) as SurfaceRefBlockComponent;
    // The resolver's `refDocId` fast path finds the frame in `secondDoc`
    // (not the current doc), and the nested preview scope renders that
    // doc's own content — proving cross-doc rendering, not just resolution.
    expect(refEl?.querySelector('.surface-ref-placeholder')).toBeFalsy();
  });

  test('a cross-doc reference self-heals once the target frame arrives, instead of staying stuck unavailable', async () => {
    // Regression: `refDoc.load()` flips `doc.ready` synchronously, but a
    // real doc's Yjs content can stream in from local storage asynchronously
    // afterward — if the resolver only ever checks once at mount time, a
    // reference can permanently show "not available" even though the target
    // is right there moments later (seen live: references worked, then
    // showed unavailable after a reload, because the target doc simply
    // hadn't finished loading yet when the block first mounted).
    const secondDoc = collection
      .createDoc(`doc:second-${Math.random().toString(16).slice(2, 8)}`)
      .getStore();
    let surfaceId = '';
    secondDoc.load(() => {
      const rootId = secondDoc.addBlock('affine:page', { title: new Text() });
      surfaceId = secondDoc.addBlock('affine:surface', {}, rootId);
    });

    // Point a reference at a frame id that doesn't exist yet — the id is
    // predetermined (not auto-generated) so it can be referenced before the
    // frame itself is created, simulating a surface-ref block mounting
    // before its cross-doc target's content has arrived. The `reference`
    // prop is never changed afterward — resolution can only succeed via the
    // new retry listener on the target doc's own Yjs updates, not via the
    // pre-existing "reference prop changed" watcher.
    const lateFrameId = 'late-arriving-frame';
    const noteId = addNote(doc);
    const refId = doc.addBlock(
      'affine:surface-ref',
      {
        reference: lateFrameId,
        refDocId: secondDoc.id,
        refFlavour: 'affine:frame',
      },
      noteId
    );

    editor.mode = 'page';
    await wait();

    const refEl = document.querySelector(
      `affine-surface-ref[data-block-id="${refId}"]`
    ) as SurfaceRefBlockComponent;
    expect(
      refEl?.querySelector('.surface-ref-placeholder.not-found')
    ).toBeTruthy();

    // Now the target frame actually appears in the source doc, under the
    // exact id the reference has been pointing at all along.
    secondDoc.addBlock(
      'affine:frame',
      {
        id: lateFrameId,
        xywh: '[0, 0, 800, 200]',
        title: new Text('Arrived Late'),
      },
      surfaceId
    );
    await wait(500);

    expect(
      refEl?.querySelector('.surface-ref-placeholder.not-found')
    ).toBeFalsy();
  });

  // AC6, Frame half: mirrors `database-ref.spec.ts`'s own
  // "survives the source block moving and the source doc being renamed"
  // test — a Frame has no note structure to move between (it's a Gfx
  // element living flat under `affine:surface`, not flow content), so its
  // "move" equivalent is repositioning its own `xywh` bound; the doc-rename
  // half is identical to the Database case.
  test('a cross-doc Frame reference survives the source frame moving and the source doc being renamed', async () => {
    const { secondDoc, frameId } = createSecondDocWithFrame();

    const noteId = addNote(doc);
    const refId = doc.addBlock(
      'affine:surface-ref',
      {
        reference: frameId,
        refDocId: secondDoc.id,
        refFlavour: 'affine:frame',
      },
      noteId
    );

    editor.mode = 'page';
    await wait();

    const refEl = document.querySelector(
      `affine-surface-ref[data-block-id="${refId}"]`
    ) as SurfaceRefBlockComponent;
    expect(refEl?.querySelector('.surface-ref-placeholder')).toBeFalsy();

    // Move the source frame to a different position on its own surface.
    secondDoc.updateBlock(secondDoc.getBlock(frameId)!.model, {
      xywh: '[500, 500, 800, 200]',
    });

    // Rename the source doc itself.
    const pageBlock = secondDoc.getBlock(secondDoc.root!.id)!.model as {
      props: { title: Text };
    } & typeof secondDoc.root;
    secondDoc.transact(() => {
      pageBlock.props.title.clear();
      pageBlock.props.title.insert('Renamed Frame Doc', 0);
    });
    await wait(500);

    expect(refEl?.querySelector('.surface-ref-placeholder')).toBeFalsy();
    expect(
      (secondDoc.getBlock(frameId)!.model as FrameBlockModel).props.xywh
    ).toBe('[500, 500, 800, 200]');
  });
});

import type { FrameBlockComponent } from '@blocksuite/affine/blocks/frame';
import type { SurfaceRefBlockComponent } from '@blocksuite/affine/blocks/surface-ref';
import { insertSurfaceRefBlockCommand } from '@blocksuite/affine/blocks/surface-ref';
import type {
  FrameBlockModel,
  SurfaceRefBlockModel,
} from '@blocksuite/affine/model';
import { Text } from '@blocksuite/store';

import snapshot from '../snapshots/edgeless/surface-ref.spec.ts/surface-ref.json' with { type: 'json' };

describe('clipboard', () => {
  test('import surface-ref snapshot should render content correctly', async () => {
    await setupEditor('page');
    const newDoc = await importFromSnapshot(
      doc.workspace,
      snapshot as DocSnapshot
    );
    expect(newDoc).toBeTruthy();

    editor.doc = newDoc!;
    await wait();

    const surfaceRefs = newDoc!.getBlocksByFlavour('affine:surface-ref');
    expect(surfaceRefs).toHaveLength(2);

    const surfaceRefBlocks = surfaceRefs.map(({ id }) =>
      editor.std.view.getBlock(id)
    ) as SurfaceRefBlockComponent[];

    expect(surfaceRefBlocks[0].querySelector('.ref-placeholder')).toBeFalsy();
    expect(surfaceRefBlocks[1].querySelector('.ref-placeholder')).toBeFalsy();
  });
});
