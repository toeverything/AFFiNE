import { describe, expect, it, vi } from 'vitest';
import type * as Y from 'yjs';

import { openSketchSubdoc, releaseSketchSubdoc } from './subdoc';

/**
 * Mirrors nbstore: one connection per guid, a second one throws, and the
 * connection is dropped when the doc is destroyed.
 */
function fakeWorkspaceStore() {
  const connected = new Set<string>();
  const onLoadDoc = vi.fn((doc: Y.Doc) => {
    if (connected.has(doc.guid)) throw new Error('doc already connected');
    connected.add(doc.guid);
    doc.on('destroy', () => connected.delete(doc.guid));
  });
  return {
    connected,
    onLoadDoc,
    store: {
      blobSync: { get: async () => null },
      doc: { workspace: { onLoadDoc } },
    },
  };
}

describe('sketch subdoc lifecycle', () => {
  it('reconnects after the last reference is released', () => {
    const { store, connected, onLoadDoc } = fakeWorkspaceStore();

    const first = openSketchSubdoc(store, 'wb-sketch-a');
    expect(connected.has('wb-sketch-a')).toBe(true);

    releaseSketchSubdoc('wb-sketch-a');
    expect(first.isDestroyed).toBe(true);
    expect(connected.has('wb-sketch-a')).toBe(false);

    const second = openSketchSubdoc(store, 'wb-sketch-a');
    expect(second).not.toBe(first);
    expect(second.isDestroyed).toBe(false);
    expect(connected.has('wb-sketch-a')).toBe(true);
    expect(onLoadDoc).toHaveBeenCalledTimes(2);

    releaseSketchSubdoc('wb-sketch-a');
  });

  it('shares one doc across references and only releases on the last', () => {
    const { store, connected } = fakeWorkspaceStore();

    const a = openSketchSubdoc(store, 'wb-sketch-b');
    const b = openSketchSubdoc(store, 'wb-sketch-b');
    expect(b).toBe(a);

    releaseSketchSubdoc('wb-sketch-b');
    expect(a.isDestroyed).toBe(false);
    expect(connected.has('wb-sketch-b')).toBe(true);

    releaseSketchSubdoc('wb-sketch-b');
    expect(a.isDestroyed).toBe(true);
    expect(connected.has('wb-sketch-b')).toBe(false);
  });

  it('does not cache a doc whose connection failed', () => {
    const store = {
      blobSync: { get: async () => null },
      doc: {
        workspace: {
          onLoadDoc: () => {
            throw new Error('doc already connected');
          },
        },
      },
    };

    expect(() => openSketchSubdoc(store, 'wb-sketch-c')).toThrow(
      'doc already connected'
    );
    // A retry must not be handed the dead doc from the failed attempt.
    expect(() => openSketchSubdoc(store, 'wb-sketch-c')).toThrow(
      'doc already connected'
    );
  });
});
