import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { generateKeyBetween } from './pos';
import { createElement, createEmptyScene } from './scene';
import {
  applyElementsToY,
  applySceneToY,
  createSketchUndoManager,
  sceneFromY,
  yjsToExcalidraw,
} from './y-binding';

function sync(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
}

describe('sketch fractional pos', () => {
  it('orders keys so inserts fit between neighbors', () => {
    const a = generateKeyBetween();
    const c = generateKeyBetween(a);
    const b = generateKeyBetween(a, c);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });
});

describe('y-excalidraw binding', () => {
  it('merges elements from two artists on one subdoc', () => {
    const a = new Y.Doc({ guid: 'sketch-a' });
    const b = new Y.Doc({ guid: 'sketch-a' });
    applyElementsToY(a, [
      createElement('rectangle', { x: 0, y: 0, width: 10, height: 10 }),
    ]);
    applyElementsToY(b, [
      createElement('ellipse', { x: 20, y: 20, width: 8, height: 8 }),
    ]);
    sync(a, b);
    expect(yjsToExcalidraw(a)).toHaveLength(2);
    expect(yjsToExcalidraw(b)).toHaveLength(2);
    const types = sceneFromY(a)
      .elements.map(element => element.type)
      .sort();
    expect(types).toEqual(['ellipse', 'rectangle']);
  });

  it('last-write-wins on the same element id', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const element = createElement('rectangle', {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    applyElementsToY(a, [element]);
    sync(a, b);
    applyElementsToY(a, [{ ...element, x: 40 }]);
    applyElementsToY(b, [{ ...element, x: 80 }]);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    expect(sceneFromY(a).elements).toHaveLength(1);
    expect([40, 80]).toContain(sceneFromY(a).elements[0]?.x);
  });

  it('undo/redo stays on the sketch UndoManager', () => {
    const doc = new Y.Doc();
    const undo = createSketchUndoManager(doc);
    applySceneToY(doc, createEmptyScene());
    undo.clear();
    applyElementsToY(doc, [
      createElement('text', { x: 1, y: 1, width: 20, height: 16 }, { text: 'hi' }),
    ]);
    expect(sceneFromY(doc).elements).toHaveLength(1);
    undo.undo();
    expect(sceneFromY(doc).elements).toHaveLength(0);
    undo.redo();
    expect(sceneFromY(doc).elements[0]?.text).toBe('hi');
  });
});
