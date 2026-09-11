import { describe, expect, it } from 'vitest';

import {
  ATTENTION_TTL_MS,
  canFollow,
  followViewport,
  isAttentionActive,
  isRemoteEditing,
  makeAttention,
  mergePayload,
  readPeers,
  remoteEditors,
  shouldPublish,
  WHITEBOARD_AWARENESS_KEY,
} from './protocol';

describe('whiteboard collab protocol', () => {
  it('throttles pointer publishes at 30–50ms', () => {
    expect(shouldPublish(0, 39, 40)).toBe(false);
    expect(shouldPublish(0, 40, 40)).toBe(true);
  });

  it('expires attention after the 5s TTL', () => {
    const now = 1_000_000;
    const pulse = makeAttention({ x: 0, y: 0, w: 100, h: 80 }, now);
    expect(pulse.until).toBe(now + ATTENTION_TTL_MS);
    expect(isAttentionActive(pulse, now + 100)).toBe(true);
    expect(isAttentionActive(pulse, now + ATTENTION_TTL_MS + 1)).toBe(false);
  });

  it('reads peers, follow viewport and remote live-editor lock', () => {
    const states = new Map([
      [
        1,
        {
          user: { name: 'Ada' },
          [WHITEBOARD_AWARENESS_KEY]: {
            viewport: { x: 10, y: 20, zoom: 0.5 },
            editing: { flavour: 'wb:chart', blockId: 'c1' },
          },
        },
      ],
      [
        2,
        {
          user: { name: 'Bob' },
          [WHITEBOARD_AWARENESS_KEY]: {
            followClientId: 1,
            pointer: { x: 4, y: 8 },
          },
        },
      ],
    ]);

    const peers = readPeers(states, 2);
    expect(peers).toHaveLength(1);
    expect(peers[0]?.name).toBe('Ada');
    expect(followViewport(states, 1)).toEqual({ x: 10, y: 20, zoom: 0.5 });
    expect(isRemoteEditing(states, 'c1', 2)).toBe(true);
    expect(isRemoteEditing(states, 'c1', 1)).toBe(false);
    expect(remoteEditors(states, 'c1', 2)).toEqual(['Ada']);
  });

  it('clears optional fields when patched to undefined/null', () => {
    const merged = mergePayload(
      {
        pointer: { x: 1, y: 2 },
        followClientId: 7,
        editing: { flavour: 'wb:sketch', blockId: 's1' },
      },
      { followClientId: null, editing: undefined, pointer: undefined }
    );
    expect(merged.followClientId).toBeUndefined();
    expect(merged.editing).toBeUndefined();
    expect(merged.pointer).toBeUndefined();
  });

  it('clears the viewport so a leaving peer stops being followable', () => {
    const merged = mergePayload(
      { viewport: { x: 1, y: 2, zoom: 1 }, attention: undefined },
      { viewport: undefined }
    );
    expect(merged.viewport).toBeUndefined();
    expect('viewport' in merged).toBe(false);
  });

  it('refuses a follow that would close a loop', () => {
    const states = new Map([
      [1, { [WHITEBOARD_AWARENESS_KEY]: { followClientId: 2 } }],
      [3, { [WHITEBOARD_AWARENESS_KEY]: {} }],
    ]);
    // 1 already follows us, so following 1 back would ping-pong the viewports.
    expect(canFollow(states, 1, 2)).toBe(false);
    expect(canFollow(states, 3, 2)).toBe(true);
    expect(canFollow(states, 2, 2)).toBe(false);
  });
});
