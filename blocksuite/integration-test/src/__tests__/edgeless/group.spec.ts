import type { EdgelessRootBlockComponent } from '@blocksuite/affine/blocks/root';
import {
  type GroupElementModel,
  LayoutType,
  NoteDisplayMode,
} from '@blocksuite/affine/model';
import type { MindmapElementModel } from '@blocksuite/affine-model';
import { beforeEach, describe, expect, test } from 'vitest';
import * as Y from 'yjs';

import { wait } from '../utils/common.js';
import { addNote, getDocRootBlock } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('group', () => {
  let service!: EdgelessRootBlockComponent['service'];

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');
    service = getDocRootBlock(window.doc, window.editor, 'edgeless').service;

    return cleanup;
  });

  test('group with no children will be removed automatically', () => {
    const map = new Y.Map<boolean>();
    const ids = Array.from({ length: 2 })
      .map(() => {
        const id = service.crud.addElement('shape', {
          shapeType: 'rect',
        })!;
        map.set(id, true);

        return id;
      })
      .concat(
        Array.from({ length: 2 }).map(() => {
          const id = addNote(doc);
          map.set(id, true);
          return id;
        })
      );
    service.crud.addElement('group', { children: map });
    doc.captureSync();
    expect(service.elements.length).toBe(3);

    service.removeElement(ids[0]);
    service.removeElement(ids[1]);
    doc.captureSync();
    expect(service.elements.length).toBe(1);

    service.removeElement(ids[2]);
    service.removeElement(ids[3]);
    doc.captureSync();
    expect(service.elements.length).toBe(0);

    doc.undo();
    expect(service.elements.length).toBe(1);
    doc.redo();
    expect(service.elements.length).toBe(0);
  });

  test('remove group should remove its children at the same time', () => {
    const map = new Y.Map<boolean>();
    const doc = service.doc;
    const noteId = addNote(doc);
    const shapeId = service.crud.addElement('shape', {
      shapeType: 'rect',
    });
    if (!shapeId) {
      throw new Error('shapeId is not found');
    }

    map.set(noteId, true);
    map.set(shapeId, true);
    const groupId = service.crud.addElement('group', { children: map });
    if (!groupId) {
      throw new Error('groupId is not found');
    }
    expect(service.elements.length).toBe(2);
    expect(doc.getBlock(noteId)).toBeDefined();
    doc.captureSync();

    service.removeElement(groupId);
    expect(service.elements.length).toBe(0);
    expect(doc.getBlock(noteId)).toBeUndefined();

    doc.undo();
    expect(doc.getBlock(noteId)).toBeDefined();
    expect(service.elements.length).toBe(2);
  });

  test("group's xywh should update automatically when children change", async () => {
    const shape1 = service.crud.addElement('shape', {
      shapeType: 'rect',
      xywh: '[0,0,100,100]',
    });
    if (!shape1) {
      throw new Error('shape1 is not found');
    }
    const shape2 = service.crud.addElement('shape', {
      shapeType: 'rect',
      xywh: '[100,100,100,100]',
    });
    if (!shape2) {
      throw new Error('shape2 is not found');
    }
    const note1 = addNote(doc, {
      displayMode: NoteDisplayMode.DocAndEdgeless,
      xywh: '[200,200,800,100]',
      edgeless: {
        style: {
          borderRadius: 8,
          borderSize: 4,
          borderStyle: 'solid',
          shadowType: '--affine-note-shadow-box',
        },
        collapse: true,
        collapsedHeight: 100,
      },
    });
    const children = new Y.Map<boolean>();

    children.set(shape1, true);
    children.set(shape2, true);
    children.set(note1, true);

    const groupId = service.crud.addElement('group', { children });
    if (!groupId) {
      throw new Error('groupId is not found');
    }

    const group = service.crud.getElementById(groupId) as GroupElementModel;
    const assertInitial = () => {
      expect(group.x).toBe(0);
      expect(group.y).toBe(0);
      expect(group.w).toBe(1000);
      expect(group.h).toBe(300);
    };

    doc.captureSync();
    await wait();
    assertInitial();

    service.removeElement(note1);
    await wait();
    expect(group.x).toBe(0);
    expect(group.y).toBe(0);
    expect(group.w).toBe(200);
    expect(group.h).toBe(200);
    doc.captureSync();

    doc.undo();
    await wait();
    assertInitial();

    service.crud.updateElement(note1, {
      xywh: '[300,300,800,100]',
    });
    await wait();
    expect(group.x).toBe(0);
    expect(group.y).toBe(0);
    expect(group.w).toBe(1100);
    expect(group.h).toBe(400);
    doc.captureSync();

    doc.undo();
    await wait();
    assertInitial();

    service.removeElement(shape1);
    await wait();
    expect(group.x).toBe(100);
    expect(group.y).toBe(100);
    expect(group.w).toBe(900);
    expect(group.h).toBe(200);
    doc.captureSync();

    doc.undo();
    await wait();
    assertInitial();

    service.crud.updateElement(shape1, {
      xywh: '[100,100,100,100]',
    });
    await wait();
    expect(group.x).toBe(100);
    expect(group.y).toBe(100);
    expect(group.w).toBe(900);
    expect(group.h).toBe(200);
    doc.captureSync();

    doc.undo();
    await wait();
    assertInitial();
  });

  test('empty group should have all zero xywh', () => {
    const map = new Y.Map<boolean>();
    const groupId = service.crud.addElement('group', { children: map });
    if (!groupId) {
      throw new Error('groupId is not found');
    }
    const group = service.crud.getElementById(groupId) as GroupElementModel;

    expect(group.x).toBe(0);
    expect(group.y).toBe(0);
    expect(group.w).toBe(0);
    expect(group.h).toBe(0);
  });

  test('descendant of group should not contain itself', () => {
    const groupIds = [1, 2, 3].map(_ => {
      return service.crud.addElement('group', {
        children: new Y.Map<boolean>(),
      }) as string;
    });
    const groups = groupIds.map(
      id => service.crud.getElementById(id) as GroupElementModel
    );

    groups.forEach(group => {
      expect(group.descendantElements).toHaveLength(0);
    });

    groups[0].addChild(groups[1]);
    groups[1].addChild(groups[2]);
    groups[2].addChild(groups[0]);

    expect(groups[0].descendantElements).toHaveLength(2);
    expect(groups[1].descendantElements).toHaveLength(1);
    expect(groups[2].descendantElements).toHaveLength(0);
  });
});

describe('mindmap', () => {
  let service!: EdgelessRootBlockComponent['service'];

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');
    service = getDocRootBlock(window.doc, window.editor, 'edgeless').service;

    return cleanup;
  });

  test('delete the root node should remove all children', async () => {
    const tree = {
      text: 'root',
      children: [
        {
          text: 'leaf1',
        },
        {
          text: 'leaf2',
        },
        {
          text: 'leaf3',
          children: [
            {
              text: 'leaf4',
            },
          ],
        },
      ],
    };
    const mindmapId = service.crud.addElement('mindmap', { children: tree });
    if (!mindmapId) {
      throw new Error('mindmapId is not found');
    }
    const mindmap = () =>
      service.crud.getElementById(mindmapId) as MindmapElementModel;

    expect(service.surface.elementModels.length).toBe(6);
    doc.captureSync();

    service.removeElement(mindmap().tree.element);
    await wait();
    expect(service.surface.elementModels.length).toBe(0);
    doc.captureSync();
    await wait();

    doc.undo();
    expect(service.surface.elementModels.length).toBe(6);
    await wait();

    service.removeElement(mindmap().tree.children[2].element);
    await wait();
    expect(service.surface.elementModels.length).toBe(4);
    await wait();

    doc.undo();
    await wait();
    expect(service.surface.elementModels.length).toBe(6);
  });

  test('mindmap should layout automatically when creating', async () => {
    const tree = {
      text: 'root',
      children: [
        {
          text: 'leaf1',
        },
        {
          text: 'leaf2',
        },
        {
          text: 'leaf3',
          children: [
            {
              text: 'leaf4',
            },
          ],
        },
      ],
    };
    const mindmapId = service.crud.addElement('mindmap', {
      type: LayoutType.RIGHT,
      children: tree,
    });
    if (!mindmapId) {
      throw new Error('mindmapId is not found');
    }
    const mindmap = () =>
      service.crud.getElementById(mindmapId) as MindmapElementModel;

    doc.captureSync();
    await wait();

    const root = mindmap().tree.element;
    const children = mindmap().tree.children.map(child => child.element);
    const leaf4 = mindmap().tree.children[2].children[0].element;

    expect(children[0].x).greaterThan(root.x + root.w);
    expect(children[1].x).greaterThan(root.x + root.w);
    expect(children[2].x).greaterThan(root.x + root.w);

    expect(children[1].y).greaterThan(children[0].y + children[0].h);
    expect(children[2].y).greaterThan(children[1].y + children[1].h);

    expect(leaf4.x).greaterThan(children[2].x + children[2].w);
  });

  test('deliberately creating a circular reference should be resolved correctly', async () => {
    const tree = {
      text: 'root',
      children: [
        {
          text: 'leaf1',
        },
        {
          text: 'leaf2',
        },
        {
          text: 'leaf3',
          children: [
            {
              text: 'leaf4',
            },
          ],
        },
      ],
    };
    const mindmapId = service.crud.addElement('mindmap', {
      type: LayoutType.RIGHT,
      children: tree,
    });
    if (!mindmapId) {
      throw new Error('mindmapId is not found');
    }

    const mindmap = () =>
      service.crud.getElementById(mindmapId) as MindmapElementModel;

    doc.captureSync();
    await wait();

    // create a circular reference
    doc.transact(() => {
      const root = mindmap().tree;
      const leaf3 = root.children[2];
      const leaf4 = root.children[2].children[0];

      mindmap().children.set(leaf3.id, {
        index: leaf3.detail.index,
        parent: leaf4.id,
      });
    });
    doc.captureSync();

    await wait();

    // the circular referenced node should be removed
    expect(mindmap().nodeMap.size).toBe(3);
  });
});
