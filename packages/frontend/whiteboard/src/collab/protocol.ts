export const WHITEBOARD_AWARENESS_KEY = 'wbCollab';

export const POINTER_THROTTLE_MS = 40;
export const VIEWPORT_THROTTLE_MS = 80;
export const ATTENTION_TTL_MS = 5000;

export type WbPointer = { x: number; y: number };
export type WbViewport = { x: number; y: number; zoom: number };
export type WbAttention = {
  x: number;
  y: number;
  w: number;
  h: number;
  until: number;
};
export type WbEditing = { flavour: string; blockId: string };

export type WhiteboardAwarenessPayload = {
  pointer?: WbPointer;
  followClientId?: number | null;
  viewport?: WbViewport;
  attention?: WbAttention;
  editing?: WbEditing;
  color?: string;
};

export type WhiteboardPeer = {
  clientId: number;
  name: string;
  color: string;
  pointer?: WbPointer;
  viewport?: WbViewport;
  attention?: WbAttention;
  editing?: WbEditing;
  followClientId?: number | null;
};

export type AwarenessLikeState = {
  user?: { name?: string };
  color?: string;
  [WHITEBOARD_AWARENESS_KEY]?: WhiteboardAwarenessPayload;
};

const PEER_COLORS = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
];

export function colorForPeer(clientId: number) {
  return PEER_COLORS[Math.abs(clientId) % PEER_COLORS.length] ?? '#2563eb';
}

export function isAttentionActive(
  attention: WbAttention | undefined,
  now = Date.now()
) {
  return !!attention && attention.until > now && attention.w > 0 && attention.h > 0;
}

export function makeAttention(
  bound: { x: number; y: number; w: number; h: number },
  now = Date.now(),
  ttl = ATTENTION_TTL_MS
): WbAttention {
  return { ...bound, until: now + ttl };
}

export function shouldPublish(
  lastMs: number,
  now: number,
  minMs: number
) {
  return now - lastMs >= minMs;
}

export function mergePayload(
  current: WhiteboardAwarenessPayload | undefined,
  patch: Partial<WhiteboardAwarenessPayload>
): WhiteboardAwarenessPayload {
  const next: WhiteboardAwarenessPayload = { ...current, ...patch };
  if (patch.followClientId === null) delete next.followClientId;
  if (patch.editing === undefined && 'editing' in patch) delete next.editing;
  if (patch.attention === undefined && 'attention' in patch) {
    delete next.attention;
  }
  if (patch.pointer === undefined && 'pointer' in patch) delete next.pointer;
  return next;
}

export function readPeers(
  states: Map<number, AwarenessLikeState>,
  localClientId?: number,
  now = Date.now()
): WhiteboardPeer[] {
  const peers: WhiteboardPeer[] = [];
  states.forEach((state, clientId) => {
    if (clientId === localClientId) return;
    const payload = state[WHITEBOARD_AWARENESS_KEY];
    peers.push({
      clientId,
      name: state.user?.name || `#${clientId}`,
      color: payload?.color || state.color || colorForPeer(clientId),
      pointer: payload?.pointer,
      viewport: payload?.viewport,
      attention: isAttentionActive(payload?.attention, now)
        ? payload?.attention
        : undefined,
      editing: payload?.editing,
      followClientId: payload?.followClientId ?? null,
    });
  });
  return peers;
}

export function followViewport(
  states: Map<number, AwarenessLikeState>,
  followClientId: number | null | undefined
) {
  if (followClientId == null) return;
  return states.get(followClientId)?.[WHITEBOARD_AWARENESS_KEY]?.viewport;
}

export function isRemoteEditing(
  states: Map<number, AwarenessLikeState>,
  blockId: string,
  localClientId?: number
) {
  for (const [clientId, state] of states) {
    if (clientId === localClientId) continue;
    if (state[WHITEBOARD_AWARENESS_KEY]?.editing?.blockId === blockId) {
      return true;
    }
  }
  return false;
}

export function remoteEditors(
  states: Map<number, AwarenessLikeState>,
  blockId: string,
  localClientId?: number
) {
  const names: string[] = [];
  states.forEach((state, clientId) => {
    if (clientId === localClientId) return;
    if (state[WHITEBOARD_AWARENESS_KEY]?.editing?.blockId === blockId) {
      names.push(state.user?.name || `#${clientId}`);
    }
  });
  return names;
}
