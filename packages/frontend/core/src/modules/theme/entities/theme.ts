import { ColorScheme } from '@blocksuite/affine/model';
import { createSignalFromObservable } from '@blocksuite/affine-shared/utils';
import type { Signal } from '@preact/signals-core';
import { Entity, LiveData } from '@toeverything/infra';

export class AppTheme extends Entity {
  theme$ = new LiveData<string | undefined>(undefined);

  themeSignal: Signal<ColorScheme>;

  constructor() {
    super();
    const { signal, cleanup } = createSignalFromObservable<ColorScheme>(
      this.theme$.map(theme =>
        theme === 'dark' ? ColorScheme.Dark : ColorScheme.Light
      ),
      ColorScheme.Light
    );
    this.themeSignal = signal;
    this.disposables.push(cleanup);
  }
}
