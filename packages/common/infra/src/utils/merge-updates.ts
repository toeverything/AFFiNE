import { mergeUpdatesV1 } from '../y-octo-session';

const EMPTY_UPDATE = new Uint8Array([0, 0]);

export function mergeUpdates(updates: Uint8Array[]) {
  if (updates.length === 0) {
    return new Uint8Array(EMPTY_UPDATE);
  }
  if (updates.length === 1) {
    return updates[0];
  }
  return mergeUpdatesV1(updates);
}
