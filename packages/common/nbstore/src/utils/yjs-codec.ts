import {
  diffUpdate as diff,
  encodeStateVectorFromUpdate as encodeStateVector,
  mergeUpdates as mergeYjsUpdates,
} from 'yjs';

export function diffUpdate(update: Uint8Array, state: Uint8Array) {
  try {
    return diff(update, state);
  } catch (cause) {
    throw new Error('invalid_binary', { cause });
  }
}

export function encodeStateVectorFromUpdate(update: Uint8Array) {
  try {
    return encodeStateVector(update);
  } catch (cause) {
    throw new Error('invalid_binary', { cause });
  }
}

export async function mergeUpdates(
  updates: Uint8Array[],
  merge: (
    updates: Uint8Array[]
  ) => Uint8Array | Promise<Uint8Array> = mergeYjsUpdates
) {
  try {
    return await merge(updates);
  } catch (cause) {
    throw new Error('invalid_binary', { cause });
  }
}
