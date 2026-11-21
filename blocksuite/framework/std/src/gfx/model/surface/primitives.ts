import {
  isYOctoMapHandle,
  isYOctoTextHandle,
  type Text,
} from '@blocksuite/store';
import * as Y from 'yjs';

import {
  SURFACE_TEXT_UNIQ_IDENTIFIER,
  SURFACE_YMAP_UNIQ_IDENTIFIER,
} from './surface-model.js';

export type SurfaceText = Text['yText'];

export type SurfaceMap<V = unknown> = Y.Map<V>;

export type SurfaceElementsMap = Y.Map<Y.Map<unknown>>;

export function createSurfaceText(initial?: string): SurfaceText {
  return new Y.Text(initial);
}

export function createSurfaceMap<V = unknown>(
  entries?: Record<string, V>
): SurfaceMap<V> {
  const map = new Y.Map<V>();
  if (entries) {
    Object.entries(entries).forEach(([key, value]) => {
      map.set(key, value);
    });
  }
  return map;
}

export function createSurfaceElementsMap(): SurfaceElementsMap {
  return new Y.Map<Y.Map<unknown>>();
}

export function isSurfaceMap<V = unknown>(
  value: unknown
): value is SurfaceMap<V> {
  return value instanceof Y.Map || isYOctoMapHandle(value);
}

function surfaceValueToJSON(value: unknown): unknown {
  if (value instanceof Y.Text || isYOctoTextHandle(value)) {
    return {
      [SURFACE_TEXT_UNIQ_IDENTIFIER]: true,
      delta: value.toDelta(),
    };
  }
  if (value instanceof Y.Map || isYOctoMapHandle(value)) {
    return {
      [SURFACE_YMAP_UNIQ_IDENTIFIER]: true,
      json: value.toJSON(),
    };
  }
  return value;
}

function surfaceValueFromJSON(value: unknown): unknown {
  if (value instanceof Object) {
    if (Reflect.has(value, SURFACE_TEXT_UNIQ_IDENTIFIER)) {
      const yText = new Y.Text();
      yText.applyDelta(Reflect.get(value, 'delta'));
      return yText;
    }
    if (Reflect.has(value, SURFACE_YMAP_UNIQ_IDENTIFIER)) {
      const yMap = new Y.Map();
      const json = Reflect.get(value, 'json') as Record<string, unknown>;
      Object.entries(json).forEach(([key, item]) => {
        yMap.set(key, item);
      });
      return yMap;
    }
  }
  return value;
}

export function surfaceElementToJSON(
  element: SurfaceMap<unknown>
): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  element.forEach((item, key) => {
    value[key] = surfaceValueToJSON(item);
  });
  return value;
}

export function surfaceElementFromJSON(
  element: Record<string, unknown>
): SurfaceMap<unknown> {
  const yMap = new Y.Map();
  Object.entries(element).forEach(([key, value]) => {
    yMap.set(key, surfaceValueFromJSON(value));
  });
  return yMap;
}

export function surfaceElementsFromJSON(
  elementsJSON: Record<string, unknown>
): SurfaceElementsMap {
  const yMap = new Y.Map<Y.Map<unknown>>();
  Object.entries(elementsJSON).forEach(([key, value]) => {
    const element = surfaceElementFromJSON(value as Record<string, unknown>);
    yMap.set(key, element);
  });
  return yMap;
}

export function surfaceElementsToJSON(
  elements: SurfaceElementsMap | undefined,
  selectedElements?: Set<string>
): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  if (elements) {
    elements.forEach((element, key) => {
      if (selectedElements?.has(key) || !selectedElements) {
        value[key] = surfaceElementToJSON(element);
      }
    });
  }
  return value;
}
