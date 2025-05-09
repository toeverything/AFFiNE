/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import { type Signal } from '@preact/signals-core';
import { AsyncDirective } from 'lit/async-directive.js';
import { directive } from 'lit/directive.js';

class WatchDirective extends AsyncDirective {
  private __signal?: Signal;
  private __dispose?: () => void;

  override render(signal: Signal<unknown>) {
    if (signal !== this.__signal) {
      this.__dispose?.();
      this.__signal = signal;

      // Whether the subscribe() callback is called because of this render
      // pass, or because of a separate signal update.
      let updateFromLit = true;
      this.__dispose = signal.subscribe(value => {
        // The subscribe() callback is called synchronously during subscribe.
        // Ignore the first call since we return the value below in that case.
        if (updateFromLit === false) {
          this.setValue(value);
        }
      });
      updateFromLit = false;
    }

    // We use peek() so that the signal access is not tracked by the effect
    // created by SignalWatcher.performUpdate(). This means that a signal
    // update won't trigger a full element update if it's only passed to
    // watch() and not otherwise accessed by the element.
    return signal.peek();
  }

  protected override disconnected(): void {
    this.__dispose?.();
  }

  protected override reconnected(): void {
    // Since we disposed the subscription in disconnected() we need to
    // resubscribe here. We don't ignore the synchronous callback call because
    // the signal might have changed while the directive is disconnected.
    //
    // There are two possible reasons for a disconnect:
    //   1. The host element was disconnected.
    //   2. The directive was not rendered during a render
    // In the first case the element will not schedule an update on reconnect,
    // so we need the synchronous call here to set the current value.
    // In the second case, we're probably reconnecting *because* of a render,
    // so the synchronous call here will go before a render call, and we'll get
    // two sets of the value (setValue() here and the return in render()), but
    // this is ok because the value will be dirty-checked by lit-html.
    this.__dispose = this.__signal?.subscribe(value => {
      this.setValue(value);
    });
  }
}

/**
 * Renders a signal and subscribes to it, updating the part when the signal
 * changes.
 */
export const watch = directive(WatchDirective);
