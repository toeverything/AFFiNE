import { UIEventState } from '../base.js';

type KeyboardEventStateOptions = {
  event: KeyboardEvent;
  composing: boolean;
};

export class KeyboardEventState extends UIEventState {
  composing: boolean;

  raw: KeyboardEvent;

  override type = 'keyboardState';

  constructor({ event, composing }: KeyboardEventStateOptions) {
    super(event);

    this.raw = event;
    this.composing = composing;
  }
}

declare global {
  interface BlockSuiteUIEventState {
    keyboardState: KeyboardEventState;
  }
}
