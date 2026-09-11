import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { generateKeyBetween } from './pos';
import { createElement, createEmptyScene } from './scene';
import type { SketchElement } from './types';
import {
  applyElementsToY,
  applySceneToY,
  createSketchUndoManager,
  getSketchYElements,
  isNewerElement,
  reconcileSketchY,
  sceneFromY,
  yjsToExcalidraw,
} from './y-binding';

function sync(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
}

function versionedElement(
  version: number,
  versionNonce: number,
  extra: Partial<SketchElement> = {}
): SketchElement {
  return {
    ...createElement('rectangle', { x: 0, y: 0, width: 10, height: 10 }),
    id: 'el-1',
    version,
    versionNonce,
    ...extra,
  };
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

  it('keeps the higher element version', () => {
    const doc = new Y.Doc();
    applyElementsToY(doc, [versionedElement(3, 700, { x: 80 })]);
    applyElementsToY(doc, [versionedElement(2, 100, { x: 40 })]);
    expect(sceneFromY(doc).elements[0]?.x).toBe(80);
    applyElementsToY(doc, [versionedElement(4, 900, { x: 120 })]);
    expect(sceneFromY(doc).elements[0]?.x).toBe(120);
  });

  it('breaks an equal version tie on the lower versionNonce', () => {
    const doc = new Y.Doc();
    applyElementsToY(doc, [versionedElement(5, 40, { x: 10 })]);
    applyElementsToY(doc, [versionedElement(5, 30, { x: 20 })]);
    expect(sceneFromY(doc).elements[0]?.x).toBe(20);
    applyElementsToY(doc, [versionedElement(5, 90, { x: 30 })]);
    expect(sceneFromY(doc).elements[0]?.x).toBe(20);
    expect(
      isNewerElement(versionedElement(5, 30), versionedElement(5, 40))
    ).toBe(true);
    expect(
      isNewerElement(versionedElement(5, 40), versionedElement(5, 30))
    ).toBe(false);
  });

  it('tombstones deleted elements instead of dropping them', () => {
    const doc = new Y.Doc();
    const other = createElement('ellipse', {
      x: 30,
      y: 30,
      width: 10,
      height: 10,
    });
    applyElementsToY(doc, [versionedElement(1, 10), other]);
    applyElementsToY(doc, [
      versionedElement(2, 10, { isDeleted: true }),
      other,
    ]);
    expect(getSketchYElements(doc).length).toBe(2);
    expect(yjsToExcalidraw(doc).map(element => element.type)).toEqual([
      'ellipse',
    ]);

    applyElementsToY(doc, [versionedElement(1, 10), other]);
    expect(yjsToExcalidraw(doc)).toHaveLength(1);
    expect(getSketchYElements(doc).length).toBe(2);
  });

  it('preserves a remote element a stale local list has not seen', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const mine = createElement('rectangle', {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const theirs = createElement('text', { x: 5, y: 5, width: 20, height: 16 });
    applyElementsToY(a, [mine]);
    applyElementsToY(b, [theirs]);
    sync(a, b);
    applyElementsToY(a, [mine]);
    expect(yjsToExcalidraw(a)).toHaveLength(2);
  });

  it('converges on one element after a concurrent write to the same id', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    applyElementsToY(a, [versionedElement(1, 10)]);
    sync(a, b);
    const localA = versionedElement(2, 500, { x: 40 });
    const localB = versionedElement(3, 700, { x: 80 });
    applyElementsToY(a, [localA]);
    applyElementsToY(b, [localB]);
    sync(a, b);
    reconcileSketchY(a, [localA]);
    reconcileSketchY(b, [localB]);
    sync(a, b);
    expect(sceneFromY(a).elements[0]?.x).toBe(80);
    expect(sceneFromY(b).elements[0]?.x).toBe(80);
  });

  it('undo/redo stays on the sketch UndoManager', () => {
    const doc = new Y.Doc();
    const undo = createSketchUndoManager(doc);
    applySceneToY(doc, createEmptyScene());
    undo.clear();
    applyElementsToY(doc, [
      createElement(
        'text',
        { x: 1, y: 1, width: 20, height: 16 },
        { text: 'hi' }
      ),
    ]);
    expect(sceneFromY(doc).elements).toHaveLength(1);
    undo.undo();
    expect(sceneFromY(doc).elements).toHaveLength(0);
    undo.redo();
    expect(sceneFromY(doc).elements[0]?.text).toBe('hi');
  });
});
