import type { YOctoDocSession } from '@blocksuite/sync/y-octo';
import {
  AbstractType as YAbstractType,
  applyUpdate as yApplyUpdate,
  Array as YArray,
  createAbsolutePositionFromRelativePosition,
  createRelativePositionFromTypeIndex,
  type Doc as YDoc,
  encodeStateAsUpdate as yEncodeStateAsUpdate,
  Map as YMap,
  type RelativePosition as YRelativePosition,
  Text as YText,
} from 'yjs';

import {
  isYOctoArrayHandle,
  isYOctoHandle,
  isYOctoMapHandle,
  isYOctoRelativePosition,
  isYOctoSpaceDoc,
  isYOctoTextHandle,
  type YOctoRelativePosition,
  type YOctoSpaceDoc,
  type YOctoTextHandle,
} from '../y-octo/space-adapter.js';
import { Boxed } from './boxed.js';
import { isPureObject } from './is-pure-object.js';
import { Text } from './text/index.js';
import type { Native2Y, TransformOptions } from './types.js';

export type TextRelativePosition = YRelativePosition | YOctoRelativePosition;

export function createTextRelativePosition(
  yText: YText | YOctoTextHandle,
  index: number,
  assoc = 0
): TextRelativePosition {
  if (isYOctoTextHandle(yText)) {
    return yText.createRelativePosition(index, assoc);
  }
  return createRelativePositionFromTypeIndex(yText, index, assoc);
}

export function resolveTextRelativePosition(
  relativePosition: TextRelativePosition,
  doc: YDoc | YOctoSpaceDoc | null | undefined,
  followUndoneDeletions = false
): number | null {
  if (!doc) {
    return null;
  }
  if (isYOctoSpaceDoc(doc)) {
    if (!isYOctoRelativePosition(relativePosition)) {
      return null;
    }
    const abs = doc.session.resolveRelativePosition(
      relativePosition.bytes,
      followUndoneDeletions
    );
    return abs ? abs.index : null;
  }
  if (isYOctoRelativePosition(relativePosition)) {
    return null;
  }
  const absolutePosition = createAbsolutePositionFromRelativePosition(
    relativePosition,
    doc,
    followUndoneDeletions
  );
  return absolutePosition ? absolutePosition.index : null;
}

export function applyDocUpdate(
  doc: YDoc | YOctoSpaceDoc | YOctoDocSession,
  update: Uint8Array,
  origin?: unknown
): void {
  if (
    isYOctoSpaceDoc(doc) ||
    typeof (doc as YOctoDocSession).applyUpdate === 'function'
  ) {
    (doc as YOctoSpaceDoc | YOctoDocSession).applyUpdate(update, origin);
    return;
  }
  yApplyUpdate(doc as YDoc, update, origin);
}

export function encodeDocStateAsUpdate(
  doc: YDoc | YOctoSpaceDoc | YOctoDocSession,
  encodedTargetStateVector?: Uint8Array
): Uint8Array {
  if (
    isYOctoSpaceDoc(doc) ||
    typeof (doc as YOctoDocSession).encodeStateAsUpdate === 'function'
  ) {
    return (doc as YOctoSpaceDoc | YOctoDocSession).encodeStateAsUpdate(
      encodedTargetStateVector
    );
  }
  return yEncodeStateAsUpdate(doc as YDoc, encodedTargetStateVector);
}

/**
 * Check whether a value is a reactive CRDT container/wrapper that should not be
 * deeply merged as a plain object.
 */
export function isCrdtValue(value: unknown): boolean {
  return (
    value instanceof YText ||
    value instanceof YArray ||
    value instanceof YMap ||
    value instanceof Text ||
    value instanceof Boxed ||
    isYOctoHandle(value)
  );
}

/**
 * Check whether a value is an underlying CRDT array container.
 */
export function isCrdtArray<T = unknown>(value: unknown): value is YArray<T> {
  return value instanceof YArray || isYOctoArrayHandle(value);
}

/**
 * Convert an underlying CRDT container to plain JSON if needed; pass plain values through.
 */
export function unwrapCrdtValue<T = unknown>(value: T): T {
  if (value instanceof YAbstractType || isYOctoHandle(value)) {
    return value.toJSON() as T;
  }
  return value;
}

export function native2Y<T>(
  value: T,
  { deep = true, transform = x => x }: TransformOptions = {}
): Native2Y<T> {
  if (value instanceof Boxed) {
    return transform(value.yMap, value) as Native2Y<T>;
  }
  if (value instanceof Text) {
    if (value.yText.doc) {
      return transform(value.yText.clone(), value) as Native2Y<T>;
    }
    return transform(value.yText, value) as Native2Y<T>;
  }
  if (Array.isArray(value)) {
    const yArray: YArray<unknown> = new YArray<unknown>();
    const result = value.map(item => {
      return deep ? native2Y(item, { deep, transform }) : item;
    });
    yArray.insert(0, result);

    return transform(yArray, value) as Native2Y<T>;
  }
  if (isPureObject(value)) {
    const yMap = new YMap<unknown>();
    Object.entries(value).forEach(([key, value]) => {
      yMap.set(key, deep ? native2Y(value, { deep, transform }) : value);
    });

    return transform(yMap, value) as Native2Y<T>;
  }

  return transform(value, value) as Native2Y<T>;
}

export function y2Native(
  yAbstract: unknown,
  { deep = true, transform = x => x }: TransformOptions = {}
) {
  if (Boxed.is(yAbstract)) {
    const data = new Boxed(yAbstract);
    return transform(data, yAbstract);
  }
  if (yAbstract instanceof YText || isYOctoTextHandle(yAbstract)) {
    const data = new Text(yAbstract);
    return transform(data, yAbstract);
  }
  if (yAbstract instanceof YArray || isYOctoArrayHandle(yAbstract)) {
    const data: unknown[] = yAbstract
      .toArray()
      .map(item => (deep ? y2Native(item, { deep, transform }) : item));

    return transform(data, yAbstract);
  }
  if (yAbstract instanceof YMap || isYOctoMapHandle(yAbstract)) {
    const data: Record<string, unknown> = Object.fromEntries(
      Array.from(yAbstract.entries()).map(([key, value]) => {
        return [key, deep ? y2Native(value, { deep, transform }) : value] as [
          string,
          unknown,
        ];
      })
    );
    return transform(data, yAbstract);
  }

  return transform(yAbstract, yAbstract);
}
