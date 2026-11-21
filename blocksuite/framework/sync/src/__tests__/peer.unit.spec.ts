import { NoopLogger } from '@blocksuite/global/utils';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { SyncPeer } from '../doc/peer.js';
import type { DocSource } from '../doc/source.js';
import { SharedPriorityTarget } from '../utils/async-queue.js';

describe('SyncPeer finishPull and disconnect handling', () => {
  it('calls finishPull even when diffToStorage is empty [0, 0]', async () => {
    const doc = new Y.Doc({ guid: 'doc:empty-handshake' });
    const remote = new Y.Doc({ guid: 'doc:empty-handshake' });

    const finishPull = vi.fn();
    const push = vi.fn();
    const source: DocSource = {
      name: 'mock-room',
      pull: async () => ({
        data: Y.encodeStateAsUpdate(remote),
        state: Y.encodeStateVector(remote),
      }),
      finishPull,
      push,
      subscribe: () => () => {},
    };

    const peer = new SyncPeer(
      doc,
      source,
      new SharedPriorityTarget(),
      new NoopLogger()
    );

    await vi.waitFor(() => {
      expect(finishPull).toHaveBeenCalledTimes(1);
    });

    const [calledDocId, diff] = finishPull.mock.calls[0] as [
      string,
      Uint8Array,
    ];
    expect(calledDocId).toBe('doc:empty-handshake');
    expect(Array.from(diff)).toEqual([0, 0]);
    expect(push).not.toHaveBeenCalled();

    peer.stop();
  });

  it('aborts connectDoc cleanly when pull rejects on disconnect', async () => {
    const doc = new Y.Doc({ guid: 'doc:disconnect-reject' });
    let pullCalls = 0;
    const finishPull = vi.fn();

    const source: DocSource = {
      name: 'mock-disconnect-room',
      pull: async () => {
        pullCalls += 1;
        throw new Error('socket closed');
      },
      finishPull,
      push: vi.fn(),
      subscribe: () => () => {},
    };

    const peer = new SyncPeer(
      doc,
      source,
      new SharedPriorityTarget(),
      new NoopLogger()
    );

    await vi.waitFor(() => {
      expect(pullCalls).toBeGreaterThanOrEqual(1);
    });

    expect(finishPull).not.toHaveBeenCalled();
    peer.stop();
  });

  it('captures local edits made while finishPull is pending without echoing pulled data', async () => {
    const doc = new Y.Doc({ guid: 'doc:edit-during-finish-pull' });
    const remote = new Y.Doc({ guid: 'doc:edit-during-finish-pull' });
    remote.getText('t').insert(0, 'seed');

    let resolveFinishPull!: () => void;
    let finishPullStarted!: () => void;
    const finishPullStartedPromise = new Promise<void>(resolve => {
      finishPullStarted = resolve;
    });

    const pushedUpdates: Uint8Array[] = [];
    const source: DocSource = {
      name: 'mock-room',
      pull: async () => ({
        data: Y.encodeStateAsUpdate(remote),
        state: Y.encodeStateVector(remote),
      }),
      finishPull: async (_docId, diff) => {
        if (
          !(
            diff.byteLength === 0 ||
            (diff.byteLength === 2 && diff[0] === 0 && diff[1] === 0)
          )
        ) {
          Y.applyUpdate(remote, diff);
        }
        finishPullStarted();
        await new Promise<void>(resolve => {
          resolveFinishPull = resolve;
        });
      },
      push: async (_docId, data) => {
        pushedUpdates.push(data);
        Y.applyUpdate(remote, data);
      },
      subscribe: () => () => {},
    };

    const peer = new SyncPeer(
      doc,
      source,
      new SharedPriorityTarget(),
      new NoopLogger()
    );

    await finishPullStartedPromise;
    // Mutate locally BEFORE finishPull resolves.
    doc.getText('t').insert(doc.getText('t').length, 'x');
    resolveFinishPull();

    await vi.waitFor(() => {
      expect(remote.getText('t').toString()).toBe('seedx');
    });
    expect(pushedUpdates.length).toBeGreaterThanOrEqual(1);

    peer.stop();
  });

  it('buffers incoming onPush updates that arrive before a subdoc finishes pull', async () => {
    const rootDoc = new Y.Doc({ guid: 'root:pending-buffer' });
    const subdoc = new Y.Doc({ guid: 'sub:pending-buffer' });
    const remoteSubdoc = new Y.Doc({ guid: 'sub:pending-buffer' });

    let emitStorageUpdate!: (id: string, data: Uint8Array) => void;
    let resolveSubdocPull!: (value: {
      data: Uint8Array;
      state: Uint8Array;
    }) => void;
    let subdocPullStarted!: () => void;
    const subdocPullStartedPromise = new Promise<void>(resolve => {
      subdocPullStarted = resolve;
    });

    const source: DocSource = {
      name: 'mock-room',
      pull: async docId => {
        if (docId === rootDoc.guid) {
          return {
            data: Y.encodeStateAsUpdate(new Y.Doc()),
            state: Y.encodeStateVector(new Y.Doc()),
          };
        }
        subdocPullStarted();
        return new Promise(resolve => {
          resolveSubdocPull = resolve;
        });
      },
      finishPull: async () => {},
      push: async () => {},
      subscribe: cb => {
        emitStorageUpdate = cb;
        return () => {};
      },
    };

    const peer = new SyncPeer(
      rootDoc,
      source,
      new SharedPriorityTarget(),
      new NoopLogger()
    );

    await vi.waitFor(() => {
      expect(peer.state.connectedDocs.has(rootDoc.guid)).toBe(true);
    });

    // Attach subdoc so SyncPeer begins pulling it.
    rootDoc.getMap('spaces').set(subdoc.guid, subdoc);
    await subdocPullStartedPromise;

    // Deliver a remote push for subdoc BEFORE its pull resolves.
    remoteSubdoc.getText('t').insert(0, 'buffered-early');
    emitStorageUpdate(subdoc.guid, Y.encodeStateAsUpdate(remoteSubdoc));

    // Give pull loop a tick to consume and buffer the update.
    await new Promise(resolve => setTimeout(resolve, 20));

    // Resolve subdoc pull with empty initial state; buffered push must still apply!
    resolveSubdocPull({
      data: Y.encodeStateAsUpdate(new Y.Doc()),
      state: Y.encodeStateVector(new Y.Doc()),
    });

    await vi.waitFor(() => {
      expect(subdoc.getText('t').toString()).toBe('buffered-early');
    });

    peer.stop();
  });
});
