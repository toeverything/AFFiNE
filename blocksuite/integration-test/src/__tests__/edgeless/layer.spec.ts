import type { EdgelessRootBlockComponent } from '@blocksuite/affine/blocks/root';
import type {
  CanvasRenderer,
  SurfaceElementModel,
} from '@blocksuite/affine/blocks/surface';
import { ungroupCommand } from '@blocksuite/affine/gfx/group';
import type {
  GroupElementModel,
  NoteBlockModel,
} from '@blocksuite/affine/model';
import { generateKeyBetween } from '@blocksuite/affine/std/gfx';
import type { BlockComponent } from '@blocksuite/std';
import type { BlockModel, Store } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';
import * as Y from 'yjs';

import { wait } from '../utils/common.js';
import {
  addNote as _addNote,
  getDocRootBlock,
  getSurface,
} from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

let service!: EdgelessRootBlockComponent['service'];

const addNote = (doc: Store, props: Record<string, unknown> = {}) => {
  return _addNote(doc, {
    index: service.layer.generateIndex(),
    ...props,
  });
};

beforeEach(async () => {
  const cleanup = await setupEditor('edgeless');
  service = getDocRootBlock(window.doc, window.editor, 'edgeless').service;

  return async () => {
    await wait(100);
    cleanup();
  };
});

test('layer manager initial state', () => {
  expect(service.layer).toBeDefined();
  expect(service.layer.layers.length).toBe(0);
  expect(service.layer.canvasLayers.length).toBe(1);
});

describe('add new edgeless blocks or canvas elements should update layer automatically', () => {
  test('add note, note, shape sequentially', async () => {
    addNote(doc);
    addNote(doc);
    service.crud.addElement('shape', {
      shapeType: 'rect',
    });

    await wait();

    expect(service.layer.layers.length).toBe(2);
  });

  test('add note, shape, note sequentially', async () => {
    addNote(doc);
    service.crud.addElement('shape', {
      shapeType: 'rect',
    });
    addNote(doc);
    await wait();

    expect(service.layer.layers.length).toBe(3);
  });
});

test('delete element should update layer automatically', () => {
  const id = addNote(doc);
  const canvasElId = service.crud.addElement('shape', {
    shapeType: 'rect',
  });

  service.removeElement(id);

  expect(service.layer.layers.length).toBe(1);

  service.removeElement(canvasElId!);

  expect(service.layer.layers.length).toBe(0);
});

test('change element should update layer automatically', async () => {
  const id = addNote(doc);
  const canvasElId = service.crud.addElement('shape', {
    shapeType: 'rect',
  });

  await wait();

  service.crud.updateElement(id, {
    index: service.layer.getReorderedIndex(
      service.crud.getElementById(id)!,
      'forward'
    ),
  });
  expect(service.layer.layers[service.layer.layers.length - 1].type).toBe(
    'block'
  );

  service.crud.updateElement(canvasElId!, {
    index: service.layer.getReorderedIndex(
      service.crud.getElementById(canvasElId!)!,
      'forward'
    ),
  });
  expect(service.layer.layers[service.layer.layers.length - 1].type).toBe(
    'canvas'
  );
});

test('new added canvas elements should be placed in the topmost canvas layer', async () => {
  addNote(doc);
  service.crud.addElement('shape', {
    shapeType: 'rect',
  });

  await wait();

  expect(service.layer.layers.length).toBe(2);
  expect(service.layer.layers[1].type).toBe('canvas');
});

test("there should be at lease one layer in canvasLayers property even there's no canvas element", () => {
  addNote(doc);

  expect(service.layer.canvasLayers.length).toBe(1);
});

test('if the topmost layer is canvas layer, the length of canvasLayers array should equal to the counts of canvas layers', () => {
  addNote(doc);
  service.crud.addElement('shape', {
    shapeType: 'rect',
  });
  addNote(doc);
  service.crud.addElement('shape', {
    shapeType: 'rect',
  });

  expect(service.layer.layers.length).toBe(4);
  expect(service.layer.canvasLayers.length).toBe(
    service.layer.layers.filter(layer => layer.type === 'canvas').length
  );
});

test('a new layer should be created in canvasLayers prop when the topmost layer is not canvas layer', () => {
  service.crud.addElement('shape', {
    shapeType: 'rect',
  });
  addNote(doc);
  service.crud.addElement('shape', {
    shapeType: 'rect',
  });
  addNote(doc);

  expect(service.layer.canvasLayers.length).toBe(3);
});

test('layer zindex should update correctly when elements changed', async () => {
  addNote(doc);
  const noteId = addNote(doc);
  const note = service.crud.getElementById(noteId);
  addNote(doc);
  service.crud.addElement('shape', {
    shapeType: 'rect',
  });
  const topShapeId = service.crud.addElement('shape', {
    shapeType: 'rect',
  });
  const topShape = service.crud.getElementById(topShapeId!)!;

  await wait();

  const assertInitialState = () => {
    expect(service.layer.layers[0].type).toBe('block');
    expect(service.layer.layers[0].zIndex).toBe(1);

    expect(service.layer.layers[1].type).toBe('canvas');
    expect(service.layer.layers[1].zIndex).toBe(4);
  };
  assertInitialState();

  service.doc.captureSync();

  service.crud.updateElement(noteId, {
    index: service.layer.getReorderedIndex(note!, 'front'),
  });
  await wait();
  service.doc.captureSync();

  const assert2StepState = () => {
    expect(service.layer.layers[1].type).toBe('canvas');
    expect(service.layer.layers[1].zIndex).toBe(3);

    expect(service.layer.layers[2].type).toBe('block');
    expect(service.layer.layers[2].zIndex).toBe(5);
  };
  assert2StepState();

  service.crud.updateElement(topShapeId!, {
    index: service.layer.getReorderedIndex(topShape!, 'front'),
  });
  await wait();
  service.doc.captureSync();

  expect(service.layer.layers[3].type).toBe('canvas');
  expect(service.layer.layers[3].zIndex).toBe(5);

  service.doc.undo();
  await wait();
  assert2StepState();

  service.doc.undo();
  await wait();
  assertInitialState();
});

test('blocks should rerender when their z-index changed', async () => {
  const blocks = [addNote(doc), addNote(doc), addNote(doc), addNote(doc)];
  const assertBlocksContent = () => {
    const blocks = Array.from(
      document.querySelectorAll(
        'affine-edgeless-root gfx-viewport > [data-block-id]'
      )
    );

    expect(blocks.length).toBe(5);

    blocks.forEach(element => {
      expect(element.children.length).toBeGreaterThan(0);
    });
  };

  await wait();
  assertBlocksContent();

  service.crud.addElement('shape', {
    shapeType: 'rect',
    index: generateKeyBetween(
      service.crud.getElementById(blocks[1])!.index,
      service.crud.getElementById(blocks[2])!.index
    ),
  });

  await wait();
  assertBlocksContent();
});

describe('layer reorder functionality', () => {
  let ids: string[] = [];

  beforeEach(() => {
    ids = [
      service.crud.addElement('shape', {
        shapeType: 'rect',
      })!,
      addNote(doc),
      service.crud.addElement('shape', {
        shapeType: 'rect',
      })!,
      addNote(doc),
    ];
  });

  test('forward', async () => {
    service.crud.updateElement(ids[0], {
      index: service.layer.getReorderedIndex(
        service.crud.getElementById(ids[0])!,
        'forward'
      ),
    });

    expect(
      service.layer.layers.findIndex(layer =>
        layer.set.has(service.crud.getElementById(ids[0]) as any)
      )
    ).toBe(1);
    expect(
      service.layer.layers.findIndex(layer =>
        layer.set.has(service.crud.getElementById(ids[1]) as any)
      )
    ).toBe(0);

    await wait();

    service.crud.updateElement(ids[1], {
      index: service.layer.getReorderedIndex(
        service.crud.getElementById(ids[1])!,
        'forward'
      ),
    });

    expect(
      service.layer.layers.findIndex(layer =>
        layer.set.has(service.crud.getElementById(ids[0]) as any)
      )
    ).toBe(0);
    expect(
      service.layer.layers.findIndex(layer =>
        layer.set.has(service.crud.getElementById(ids[1]) as any)
      )
    ).toBe(1);
  });

  test('front', async () => {
    service.crud.updateElement(ids[0], {
      index: service.layer.getReorderedIndex(
        service.crud.getElementById(ids[0])!,
        'front'
      ),
    });

    await wait();

    expect(
      service.layer.layers.findIndex(layer =>
        layer.set.has(service.crud.getElementById(ids[0]) as any)
      )
    ).toBe(3);

    service.crud.updateElement(ids[1], {
      index: service.layer.getReorderedIndex(
        service.crud.getElementById(ids[1])!,
        'front'
      ),
    });

    expect(
      service.layer.layers.findIndex(layer =>
        layer.set.has(service.crud.getElementById(ids[1]) as any)
      )
    ).toBe(3);
  });

  test('backward', async () => {
    service.crud.updateElement(ids[3], {
      index: service.layer.getReorderedIndex(
        service.crud.getElementById(ids[3])!,
        'backward'
      ),
    });

    expect(
      service.layer.layers.findIndex(layer =>
        layer.set.has(service.crud.getElementById(ids[3]) as any)
      )
    ).toBe(1);
    expect(
      service.layer.layers.findIndex(layer =>
        layer.set.has(service.crud.getElementById(ids[2]) as any)
      )
    ).toBe(2);

    await wait();

    service.crud.updateElement(ids[2], {
      index: service.layer.getReorderedIndex(
        service.crud.getElementById(ids[2])!,
        'backward'
      ),
    });

    expect(
      service.layer.layers.findIndex(layer =>
        layer.set.has(service.crud.getElementById(ids[3]) as any)
      )
    ).toBe(3);
    expect(
      service.layer.layers.findIndex(layer =>
        layer.set.has(service.crud.getElementById(ids[2]) as any)
      )
    ).toBe(2);
  });

  test('back', async () => {
    service.crud.updateElement(ids[3], {
      index: service.layer.getReorderedIndex(
        service.crud.getElementById(ids[3])!,
        'back'
      ),
    });

    expect(
      service.layer.layers.findIndex(layer =>
        layer.set.has(service.crud.getElementById(ids[3]) as any)
      )
    ).toBe(0);

    await wait();

    service.crud.updateElement(ids[2], {
      index: service.layer.getReorderedIndex(
        service.crud.getElementById(ids[2])!,
        'back'
      ),
    });

    expect(
      service.layer.layers.findIndex(layer =>
        layer.set.has(service.crud.getElementById(ids[2]) as any)
      )
    ).toBe(0);
  });
});

describe('group related functionality', () => {
  const createGroup = (
    service: EdgelessRootBlockComponent['service'],
    childIds: string[]
  ) => {
    const children = new Y.Map<boolean>();
    childIds.forEach(id => children.set(id, true));

    return service.crud.addElement('group', {
      children,
    });
  };

  test("new added group should effect it children's layer", async () => {
    const edgeless = getDocRootBlock(doc, editor, 'edgeless');
    const elements = [
      service.crud.addElement('shape', {
        shapeType: 'rect',
      })!,
      addNote(doc),
      service.crud.addElement('shape', {
        shapeType: 'rect',
      })!,
      addNote(doc),
      service.crud.addElement('shape', {
        shapeType: 'rect',
      })!,
    ];

    await wait(0);
    expect(
      edgeless.querySelectorAll<HTMLCanvasElement>('.indexable-canvas').length
    ).toBe(2);

    Array.from(
      edgeless.querySelectorAll<HTMLCanvasElement>('.indexable-canvas')
    ).forEach(canvas => {
      const rect = canvas.getBoundingClientRect();

      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    });

    createGroup(
      service,
      elements.filter((_, idx) => idx !== 1 && idx !== 3)
    );

    expect(service.layer.layers.length).toBe(2);

    expect(service.layer.layers[0].type).toBe('block');
    expect(service.layer.layers[0].set.size).toBe(2);

    expect(service.layer.layers[1].type).toBe('canvas');
    expect(service.layer.layers[1].set.size).toBe(4);

    expect(
      edgeless.querySelectorAll<HTMLCanvasElement>('.indexable-canvas').length
    ).toBe(0);

    const topCanvas = edgeless.querySelector(
      'affine-surface canvas'
    ) as HTMLCanvasElement;

    expect(
      Number(
        (
          edgeless.querySelector(
            `[data-block-id="${elements[1]}"]`
          ) as HTMLElement
        ).style.zIndex
      )
    ).toBeLessThan(Number(topCanvas.style.zIndex));
    expect(
      Number(
        (
          edgeless.querySelector(
            `[data-block-id="${elements[3]}"]`
          ) as HTMLElement
        ).style.zIndex
      )
    ).toBeLessThan(Number(topCanvas.style.zIndex));
  });

  test("change group index should update its children's layer", () => {
    const elements = [
      service.crud.addElement('shape', {
        shapeType: 'rect',
      })!,
      addNote(doc),
      service.crud.addElement('shape', {
        shapeType: 'rect',
      })!,
      addNote(doc),
      service.crud.addElement('shape', {
        shapeType: 'rect',
      })!,
    ];

    const groupId = createGroup(
      service,
      elements.filter((_, idx) => idx !== 1 && idx !== 3)
    )!;
    const group = service.crud.getElementById(groupId)!;

    expect(service.layer.layers.length).toBe(2);

    group.index = service.layer.getReorderedIndex(group, 'back');
    expect(service.layer.layers[0].type).toBe('canvas');
    expect(service.layer.layers[0].set.size).toBe(4);
    expect(service.layer.layers[0].elements[0]).toBe(group);

    group.index = service.layer.getReorderedIndex(group, 'front');
    expect(service.layer.layers[1].type).toBe('canvas');
    expect(service.layer.layers[1].set.size).toBe(4);
    expect(service.layer.layers[1].elements[0]).toBe(group);
  });

  test('should keep relative index order of elements after group, ungroup, undo, redo', () => {
    const edgeless = getDocRootBlock(doc, editor, 'edgeless');
    const elementIds = [
      service.crud.addElement('shape', {
        shapeType: 'rect',
      })!,
      addNote(doc),
      service.crud.addElement('shape', {
        shapeType: 'rect',
      })!,
      addNote(doc),
      service.crud.addElement('shape', {
        shapeType: 'rect',
      })!,
    ];
    service.doc.captureSync();
    const elements = elementIds.map(id => service.crud.getElementById(id)!);

    const isKeptRelativeOrder = () => {
      return elements.every((element, idx) => {
        if (idx === 0) return true;
        return elements[idx - 1].index < element.index;
      });
    };

    expect(isKeptRelativeOrder()).toBeTruthy();

    const groupId = createGroup(edgeless.service, elementIds)!;
    expect(isKeptRelativeOrder()).toBeTruthy();

    service.std.command.exec(ungroupCommand, {
      group: service.crud.getElementById(groupId) as GroupElementModel,
    });
    expect(isKeptRelativeOrder()).toBeTruthy();

    service.doc.undo();
    expect(isKeptRelativeOrder()).toBeTruthy();

    service.doc.redo();
    expect(isKeptRelativeOrder()).toBeTruthy();
  });
});

describe('compare function', () => {
  const SORT_ORDER = {
    AFTER: 1,
    BEFORE: -1,
    SAME: 0,
  };
  const createGroup = (
    service: EdgelessRootBlockComponent['service'],
    childIds: string[]
    // eslint-disable-next-line sonarjs/no-identical-functions
  ) => {
    const children = new Y.Map<boolean>();
    childIds.forEach(id => children.set(id, true));

    return service.crud.addElement('group', {
      children,
    });
  };

  test('compare same element', () => {
    const shapeId = service.crud.addElement('shape', {
      shapeType: 'rect',
    })!;
    const shapeEl = service.crud.getElementById(shapeId)!;
    expect(service.layer.compare(shapeEl, shapeEl)).toBe(SORT_ORDER.SAME);

    const groupId = createGroup(service, [shapeId])!;
    const groupEl = service.crud.getElementById(groupId)!;
    expect(service.layer.compare(groupEl, groupEl)).toBe(SORT_ORDER.SAME);

    const noteId = addNote(doc);
    const note = service.crud.getElementById(noteId)! as NoteBlockModel;
    expect(service.layer.compare(note, note)).toBe(SORT_ORDER.SAME);
  });

  test('compare a group and its child', () => {
    const shapeId = service.crud.addElement('shape', {
      shapeType: 'rect',
    })!;
    const shapeEl = service.crud.getElementById(shapeId)!;
    const noteId = addNote(doc);
    const note = service.crud.getElementById(noteId)! as NoteBlockModel;
    const groupId = createGroup(service, [shapeId, noteId])!;
    const groupEl = service.crud.getElementById(groupId)!;

    expect(service.layer.compare(groupEl, shapeEl)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(shapeEl, groupEl)).toBe(SORT_ORDER.AFTER);
    expect(service.layer.compare(groupEl, note)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(note, groupEl)).toBe(SORT_ORDER.AFTER);
  });

  test('compare two different elements', () => {
    const shape1Id = service.crud.addElement('shape', {
      shapeType: 'rect',
    })!;
    const shape1 = service.crud.getElementById(shape1Id)!;
    const shape2Id = service.crud.addElement('shape', {
      shapeType: 'rect',
    })!;
    const shape2 = service.crud.getElementById(shape2Id)!;
    const note1Id = addNote(doc);

    const note1 = service.crud.getElementById(note1Id)! as NoteBlockModel;
    const note2Id = addNote(doc);
    const note2 = service.crud.getElementById(note2Id)! as NoteBlockModel;

    expect(service.layer.compare(shape1, shape2)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(shape2, shape1)).toBe(SORT_ORDER.AFTER);

    expect(service.layer.compare(note1, note2)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(note2, note1)).toBe(SORT_ORDER.AFTER);

    expect(service.layer.compare(shape1, note1)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(note1, shape1)).toBe(SORT_ORDER.AFTER);

    expect(service.layer.compare(shape2, note2)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(note2, shape2)).toBe(SORT_ORDER.AFTER);
  });

  test('compare nested elements', () => {
    const shape1Id = service.crud.addElement('shape', {
      shapeType: 'rect',
    })!;
    const shape2Id = service.crud.addElement('shape', {
      shapeType: 'rect',
    })!;
    const note1Id = addNote(doc);
    const note2Id = addNote(doc);
    const group1Id = createGroup(service, [
      shape1Id,
      shape2Id,
      note1Id,
      note2Id,
    ])!;
    const group2Id = createGroup(service, [group1Id])!;

    const shape1 = service.crud.getElementById(shape1Id)!;
    const shape2 = service.crud.getElementById(shape2Id)!;
    const note1 = service.crud.getElementById(note1Id)! as NoteBlockModel;
    const note2 = service.crud.getElementById(note2Id)! as NoteBlockModel;
    const group1 = service.crud.getElementById(group1Id)!;
    const group2 = service.crud.getElementById(group2Id)!;

    // assert nested group to group
    expect(service.layer.compare(group2, group1)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(group1, group2)).toBe(SORT_ORDER.AFTER);

    // assert element in the same group
    expect(service.layer.compare(shape1, shape2)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(shape2, shape1)).toBe(SORT_ORDER.AFTER);
    expect(service.layer.compare(note1, note2)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(note2, note1)).toBe(SORT_ORDER.AFTER);

    // assert group and its nested element
    expect(service.layer.compare(group2, shape1)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(shape1, group2)).toBe(SORT_ORDER.AFTER);
    expect(service.layer.compare(group1, shape2)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(shape2, group1)).toBe(SORT_ORDER.AFTER);
    expect(service.layer.compare(group2, note1)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(note1, group2)).toBe(SORT_ORDER.AFTER);
    expect(service.layer.compare(group1, note2)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(note2, group1)).toBe(SORT_ORDER.AFTER);
  });

  test('compare two nested elements', () => {
    const groupAShapeId = service.crud.addElement('shape', {
      shapeType: 'rect',
    })!;
    const groupANoteId = addNote(doc);
    const groupAId = createGroup(service, [
      createGroup(service, [groupAShapeId, groupANoteId])!,
    ])!;
    const groupAShape = service.crud.getElementById(groupAShapeId)!;
    const groupANote = service.crud.getElementById(groupANoteId)!;
    const groupA = service.crud.getElementById(groupAId)!;

    const groupBShapeId = service.crud.addElement('shape', {
      shapeType: 'rect',
    })!;
    const groupBNoteId = addNote(doc);
    const groupBId = createGroup(service, [
      createGroup(service, [groupBShapeId, groupBNoteId])!,
    ])!;
    const groupBShape = service.crud.getElementById(groupBShapeId)!;
    const groupBNote = service.crud.getElementById(groupBNoteId)!;
    const groupB = service.crud.getElementById(groupBId)!;

    expect(service.layer.compare(groupAShape, groupBShape)).toBe(
      SORT_ORDER.BEFORE
    );
    expect(service.layer.compare(groupBShape, groupAShape)).toBe(
      SORT_ORDER.AFTER
    );
    expect(service.layer.compare(groupANote, groupBNote)).toBe(
      SORT_ORDER.BEFORE
    );
    expect(service.layer.compare(groupBNote, groupANote)).toBe(
      SORT_ORDER.AFTER
    );
    expect(service.layer.compare(groupB, groupA)).toBe(SORT_ORDER.AFTER);

    groupB.index = service.layer.getReorderedIndex(groupB, 'back');
    expect(service.layer.compare(groupB, groupA)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(groupAShape, groupBShape)).toBe(
      SORT_ORDER.AFTER
    );
    expect(service.layer.compare(groupBShape, groupAShape)).toBe(
      SORT_ORDER.BEFORE
    );
    expect(service.layer.compare(groupANote, groupBNote)).toBe(
      SORT_ORDER.AFTER
    );
    expect(service.layer.compare(groupBNote, groupANote)).toBe(
      SORT_ORDER.BEFORE
    );

    groupA.index = service.layer.getReorderedIndex(groupA, 'back');
    expect(service.layer.compare(groupA, groupB)).toBe(SORT_ORDER.BEFORE);
    expect(service.layer.compare(groupAShape, groupBShape)).toBe(
      SORT_ORDER.BEFORE
    );
    expect(service.layer.compare(groupBShape, groupAShape)).toBe(
      SORT_ORDER.AFTER
    );
    expect(service.layer.compare(groupANote, groupBNote)).toBe(
      SORT_ORDER.BEFORE
    );
    expect(service.layer.compare(groupBNote, groupANote)).toBe(
      SORT_ORDER.AFTER
    );
  });
});

test('indexed canvas should be inserted into edgeless portal when switch to edgeless mode', async () => {
  let surface = getSurface(doc, editor);

  service.crud.addElement('shape', {
    shapeType: 'rect',
  })!;

  addNote(doc);

  await wait();

  service.crud.addElement('shape', {
    shapeType: 'rect',
  })!;

  editor.mode = 'page';
  await wait();
  editor.mode = 'edgeless';
  await wait();

  surface = getSurface(doc, editor);
  const edgeless = getDocRootBlock(doc, editor, 'edgeless');
  expect(edgeless.querySelectorAll('.indexable-canvas').length).toBe(1);

  const indexedCanvas = edgeless.querySelectorAll(
    '.indexable-canvas'
  )[0] as HTMLCanvasElement;

  expect(indexedCanvas.width).toBe(
    (surface.renderer as CanvasRenderer).canvas.width
  );
  expect(indexedCanvas.height).toBe(
    (surface.renderer as CanvasRenderer).canvas.height
  );
  expect(indexedCanvas.width).not.toBe(0);
  expect(indexedCanvas.height).not.toBe(0);
});

test('the actual rendering z-index should satisfy the logic order of their indexes', async () => {
  editor.mode = 'page';

  await wait();

  const indexes = [
    'ao',
    'b0D',
    'ar',
    'as',
    'at',
    'au',
    'av',
    'b0Y',
    'b0V',
    'b0H',
    'b0M',
    'b0T',
    'b0f',
    'b0fV',
    'b0g',
    'b0i',
    'b0fl',
  ];

  indexes.forEach(index => {
    addNote(doc, {
      index,
    });
  });

  await wait();

  editor.mode = 'edgeless';
  await wait(500);

  const edgeless = getDocRootBlock(doc, editor, 'edgeless');
  const blocks = Array.from(
    edgeless.querySelectorAll('gfx-viewport > [data-block-id]')
  ) as BlockComponent[];

  expect(blocks.length).toBe(indexes.length + 1);

  blocks
    .filter(block => block.flavour !== 'affine:surface')
    .forEach((block, index) => {
      if (index === blocks.length - 1) return;

      const model = block.model as BlockModel<{ index: string }>;
      const nextModel = blocks[index + 1].model as BlockModel<{
        index: string;
      }>;

      const zIndex = Number(block.style.zIndex);
      const nextZIndex = Number(blocks[index + 1].style.zIndex);

      expect(model.props.index <= nextModel.props.index).equals(
        zIndex <= nextZIndex
      );
    });
});

describe('index generator', () => {
  let preinsertedShape: SurfaceElementModel;
  let preinsertedNote: NoteBlockModel;

  beforeEach(() => {
    const shapeId = service.crud.addElement('shape', {
      shapeType: 'rect',
    })!;
    const noteId = addNote(doc);

    preinsertedShape = service.crud.getElementById(
      shapeId
    )! as SurfaceElementModel;
    preinsertedNote = service.crud.getElementById(noteId)! as NoteBlockModel;
  });

  test('generator should remember the index it generated', () => {
    const generator = service.layer.createIndexGenerator();

    const shape1 = generator();
    const block1 = generator();
    const shape2 = generator();
    const block2 = generator();

    expect(block2 > shape2).toBeTruthy();
    expect(shape2 > block1).toBeTruthy();
    expect(block1 > shape1).toBeTruthy();
    expect(shape1 > preinsertedNote.index).toBeTruthy();
    expect(shape1 > preinsertedShape.index).toBeTruthy();
  });
});
