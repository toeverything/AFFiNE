import type { YOctoAwarenessSession } from '@blocksuite/sync/y-octo';
import type { Awareness } from 'y-protocols/awareness.js';

export type AwarenessLike = Awareness | YOctoAwarenessSession;

export interface UserInfo {
  name: string;
}

type UserSelection = Array<Record<string, unknown>>;

// Raw JSON state in awareness CRDT
export type RawAwarenessState = {
  user?: UserInfo;
  color?: string;
  selectionV2: Record<string, UserSelection>;
};

export interface AwarenessEvent {
  id: number;
  type: 'add' | 'update' | 'remove';
  state?: RawAwarenessState;
}

export class AwarenessStore {
  readonly awareness: Awareness;

  constructor(awareness: AwarenessLike) {
    this.awareness = awareness as Awareness;
    this.awareness.setLocalStateField('selectionV2', {});
  }

  destroy() {
    this.awareness.destroy();
  }

  getLocalSelection(
    selectionManagerId: string
  ): ReadonlyArray<Record<string, unknown>> {
    return (
      (this.awareness.getLocalState()?.selectionV2 ?? {})[selectionManagerId] ??
      []
    );
  }

  getStates(): Map<number, RawAwarenessState> {
    return this.awareness.getStates() as Map<number, RawAwarenessState>;
  }

  getLocalState(): RawAwarenessState {
    return this.awareness.getLocalState() as RawAwarenessState;
  }

  setLocalState(state: RawAwarenessState): void {
    this.awareness.setLocalState(state);
  }

  setLocalStateField<Field extends keyof RawAwarenessState>(
    field: Field,
    value: RawAwarenessState[Field]
  ): void {
    this.awareness.setLocalStateField(field, value);
  }

  setLocalSelection(selectionManagerId: string, selection: UserSelection) {
    const oldSelection = this.awareness.getLocalState()?.selectionV2 ?? {};
    this.awareness.setLocalStateField('selectionV2', {
      ...oldSelection,
      [selectionManagerId]: selection,
    });
  }
}
