import type { UIEventHandler } from '@blocksuite/std';

import type { AffineDragHandleWidget } from '../drag-handle.js';

export class KeyboardEventWatcher {
  private readonly _keyboardHandler: UIEventHandler = ctx => {
    if (!this.widget.dragging) {
      return;
    }

    const state = ctx.get('defaultState');
    const event = state.event as KeyboardEvent;
    event.preventDefault();
    event.stopPropagation();
  };

  constructor(readonly widget: AffineDragHandleWidget) {}

  watch() {
    this.widget.handleEvent('beforeInput', () => this.widget.hide());
    this.widget.handleEvent('keyDown', this._keyboardHandler, { global: true });
    this.widget.handleEvent('keyUp', this._keyboardHandler, { global: true });
  }
}
