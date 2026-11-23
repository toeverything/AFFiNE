import { DisposableGroup } from '@blocksuite/global/disposable';
import { Signal } from '@preact/signals-core';

import type { BlockStdScope } from '../scope/std-scope.js';

export class KeyboardController {
  private readonly _disposable = new DisposableGroup();

  shiftKey$ = new Signal<boolean>(false);

  spaceKey$ = new Signal<boolean>(false);

  constructor(readonly std: BlockStdScope) {
    this._init();
  }

  private _init() {
    this._disposable.add(
      this._listenKeyboard('keydown', evt => {
        this.shiftKey$.value = evt.shiftKey && evt.key === 'Shift';
        this.spaceKey$.value = evt.code === 'Space';
      })
    );

    this._disposable.add(
      this._listenKeyboard('keyup', evt => {
        this.shiftKey$.value =
          evt.shiftKey && evt.key === 'Shift' ? true : false;

        if (evt.code === 'Space') {
          this.spaceKey$.value = false;
        }
      })
    );
  }

  private _listenKeyboard(
    event: 'keydown' | 'keyup',
    callback: (keyboardEvt: KeyboardEvent) => void
  ) {
    document.addEventListener(event, callback, false);

    return () => {
      document.removeEventListener(event, callback, false);
    };
  }

  dispose() {
    this._disposable.dispose();
  }
}
