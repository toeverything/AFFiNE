import { UIEventState } from '../base.js';

type ClipboardEventStateOptions = {
  event: ClipboardEvent;
};

export class ClipboardEventState extends UIEventState {
  raw: ClipboardEvent;

  override type = 'clipboardState';

  constructor({ event }: ClipboardEventStateOptions) {
    super(event);

    this.raw = event;
  }
}

declare global {
  interface BlockSuiteUIEventState {
    clipboardState: ClipboardEventState;
  }
}
