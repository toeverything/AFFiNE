import { compactDocUpdatesV1 } from '@affine/native';

export function mergeUpdate(updates: Uint8Array[]) {
  if (updates.length === 0) {
    return new Uint8Array();
  }
  if (updates.length === 1) {
    return updates[0];
  }
  return compactDocUpdatesV1(updates);
}
