import { LiveData, Service } from '@toeverything/infra';
import { setElementVars } from '@vanilla-extract/dynamic';

import { globalVars } from '../../../styles/variables.css';
import type { VirtualKeyboardProvider } from '../providers/virtual-keyboard';

export class VirtualKeyboardService extends Service {
  readonly visible$ = new LiveData(false);
  readonly height$ = new LiveData(0);

  staticHeight = 0;

  constructor(
    private readonly virtualKeyboardProvider: VirtualKeyboardProvider
  ) {
    super();
    this._observe();
  }

  private _observe() {
    this.disposables.push(
      this.virtualKeyboardProvider.onChange(info => {
        const layoutHeight = info.overlaysContent === false ? 0 : info.height;

        this.visible$.next(info.visible);
        this.height$.next(layoutHeight);

        setElementVars(document.body, {
          [globalVars.appKeyboardHeight]: `${this.height$.value}px`,
        });

        if (info.visible && this.staticHeight !== info.height) {
          this.staticHeight = info.height;
          setElementVars(document.body, {
            [globalVars.appKeyboardStaticHeight]: `${this.staticHeight}px`,
          });
        }
      })
    );
  }
}
