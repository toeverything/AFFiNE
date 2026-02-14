import {
  applyUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  UndoManager,
} from 'yjs';

export function generateDocUpdate(
  fromNewerBin: Uint8Array,
  toOlderBin: Uint8Array
): Uint8Array {
  const newerDoc = new Doc();
  applyUpdate(newerDoc, fromNewerBin);
  const olderDoc = new Doc();
  applyUpdate(olderDoc, toOlderBin);

  const newerState = encodeStateVector(newerDoc);
  const olderState = encodeStateVector(olderDoc);

  const diff = encodeStateAsUpdate(newerDoc, olderState);

  const undoManager = new UndoManager(Array.from(olderDoc.share.values()));

  applyUpdate(olderDoc, diff);

  undoManager.undo();

  return encodeStateAsUpdate(olderDoc, newerState);
}
