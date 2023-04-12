import type { ThemeMode } from '../types';

export class LocalStorageThemeHelper {
  name = 'Affine-theme-mode';
  get = (): ThemeMode | null => {
    return localStorage.getItem(this.name) as ThemeMode | null;
  };
  set = (mode: ThemeMode) => {
    localStorage.setItem(this.name, mode);
  };
}

export const localStorageThemeHelper = new LocalStorageThemeHelper();
