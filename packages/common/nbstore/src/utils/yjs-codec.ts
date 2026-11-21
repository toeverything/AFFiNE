import {
  diffUpdateV1,
  encodeStateVectorFromUpdateV1,
  mergeUpdatesV1,
} from '@toeverything/infra/y-octo-session';

function defaultMergeUpdates(updates: Uint8Array[]): Uint8Array {
  if (updates.length === 0) {
    return new Uint8Array([0, 0]);
  }
  return mergeUpdatesV1(updates);
}

export function diffUpdate(update: Uint8Array, state: Uint8Array) {
  try {
    return diffUpdateV1(update, state);
  } catch (cause) {
    throw new Error('invalid_binary', { cause });
  }
}

export function encodeStateVectorFromUpdate(update: Uint8Array) {
  try {
    return encodeStateVectorFromUpdateV1(update);
  } catch (cause) {
    throw new Error('invalid_binary', { cause });
  }
}

export async function mergeUpdates(
  updates: Uint8Array[],
  merge: (
    updates: Uint8Array[]
  ) => Uint8Array | Promise<Uint8Array> = defaultMergeUpdates
) {
  try {
    return await merge(updates);
  } catch (cause) {
    throw new Error('invalid_binary', { cause });
  }
}
