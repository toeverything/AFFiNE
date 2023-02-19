import { ThemeMode } from '../types';

export class LocalStorageThemeHelper {
  name = 'Affine-theme-mode';
  callback = new Set<() => void>();
  get = (): ThemeMode | null => {
    return localStorage.getItem(this.name) as ThemeMode | null;
  };
  set = (mode: ThemeMode) => {
    localStorage.setItem(this.name, mode);
    this.callback.forEach(cb => cb());
  };
}

export const localStorageThemeHelper = new LocalStorageThemeHelper();
