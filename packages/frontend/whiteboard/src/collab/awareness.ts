import {
  mergePayload,
  WHITEBOARD_AWARENESS_KEY,
  type WhiteboardAwarenessPayload,
} from './protocol';

export type DuckAwareness = {
  clientID?: number;
  getLocalState?: () =>
    | { [WHITEBOARD_AWARENESS_KEY]?: WhiteboardAwarenessPayload }
    | null
    | undefined;
  setLocalStateField?: (key: string, value: unknown) => void;
  getStates?: () => Map<number, { [key: string]: unknown }>;
  on?: (event: string, listener: () => void) => void;
  off?: (event: string, listener: () => void) => void;
};

export function getDocAwareness(store: unknown): DuckAwareness | undefined {
  return (
    store as {
      awarenessStore?: { awareness?: DuckAwareness };
    }
  )?.awarenessStore?.awareness;
}

export function readLocalPayload(awareness: DuckAwareness | undefined) {
  return awareness?.getLocalState?.()?.[WHITEBOARD_AWARENESS_KEY];
}

export function patchCollabAwareness(
  awareness: DuckAwareness | undefined,
  patch: Partial<WhiteboardAwarenessPayload>
) {
  if (!awareness?.setLocalStateField) return;
  awareness.setLocalStateField(
    WHITEBOARD_AWARENESS_KEY,
    mergePayload(readLocalPayload(awareness), patch)
  );
}

export function publishWidgetEditing(
  store: unknown,
  flavour: string,
  blockId: string | null
) {
  patchCollabAwareness(getDocAwareness(store), {
    editing: blockId ? { flavour, blockId } : undefined,
  });
}

export function remoteOwnsLiveEditor(store: unknown, blockId: string) {
  const awareness = getDocAwareness(store);
  const states = awareness?.getStates?.();
  if (!states) return false;
  for (const [clientId, state] of states) {
    if (clientId === awareness.clientID) continue;
    const payload = (
      state as { [WHITEBOARD_AWARENESS_KEY]?: WhiteboardAwarenessPayload }
    )[WHITEBOARD_AWARENESS_KEY];
    if (payload?.editing?.blockId === blockId) return true;
  }
  return false;
}
