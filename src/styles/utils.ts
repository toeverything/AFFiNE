import { ThemeMode } from '@/styles/types';

export class SystemTheme {
  media: MediaQueryList = window.matchMedia('(prefers-color-scheme: light)');
  eventList: Array<(e: Event) => void> = [];
  eventHandler = (e: Event) => {
    this.eventList.forEach(fn => fn(e));
  };

  constructor() {
    this.media.addEventListener('change', this.eventHandler);
  }

  get = (): ThemeMode => {
    if (typeof window === 'undefined') {
      return 'light';
    }
    return this.media.matches ? 'light' : 'dark';
  };

  onChange = (callback: () => void) => {
    this.eventList.push(callback);
  };

  dispose = () => {
    this.eventList = [];
    this.media.removeEventListener('change', this.eventHandler);
  };
}

export class LocalStorageThemeMode {
  name = 'Affine-theme-mode';
  get = (): ThemeMode | null => {
    return localStorage.getItem(this.name) as ThemeMode | null;
  };
  set = (mode: ThemeMode) => {
    localStorage.setItem(this.name, mode);
  };
}
