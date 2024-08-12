import type { GlobalState } from '@toeverything/infra';
import { LiveData, Service } from '@toeverything/infra';
import { map } from 'rxjs';

import type { CustomTheme } from '../types';

export class ThemeEditorService extends Service {
  constructor(public readonly globalState: GlobalState) {
    super();
  }

  private readonly _key = 'custom-theme';

  customTheme$ = LiveData.from<CustomTheme | undefined>(
    this.globalState.watch<CustomTheme>(this._key).pipe(
      map(value => {
        if (!value) return { light: {}, dark: {} };
        if (!value.light) value.light = {};
        if (!value.dark) value.dark = {};
        const removeEmpty = (obj: Record<string, string>) =>
          Object.fromEntries(Object.entries(obj).filter(([, v]) => v));
        return {
          light: removeEmpty(value.light),
          dark: removeEmpty(value.dark),
        };
      })
    ),
    { light: {}, dark: {} }
  );

  modified$ = LiveData.computed(get => {
    const theme = get(this.customTheme$);
    const isEmptyObj = (obj: Record<string, string>) =>
      Object.keys(obj).length === 0;
    return theme && !(isEmptyObj(theme.light) && isEmptyObj(theme.dark));
  });

  reset() {
    this.globalState.set(this._key, { light: {}, dark: {} });
  }

  setCustomTheme(theme: CustomTheme) {
    this.globalState.set(this._key, theme);
  }

  updateCustomTheme(mode: 'light' | 'dark', key: string, value?: string) {
    const prev: CustomTheme = this.globalState.get(this._key) ?? {
      light: {},
      dark: {},
    };
    const next = {
      ...prev,
      [mode]: {
        ...prev[mode],
        [key]: value,
      },
    };

    if (!value) {
      delete next[mode][key];
    }

    this.globalState.set(this._key, next);
  }
}
