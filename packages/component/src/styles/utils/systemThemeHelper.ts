import { Theme } from '../types';

export class SystemThemeHelper {
  media: MediaQueryList = window.matchMedia('(prefers-color-scheme: light)');
  eventList: Array<(e: Event) => void> = [];
  eventHandler = (e: Event) => {
    this.eventList.forEach(fn => fn(e));
  };

  constructor() {
    this.media.addEventListener('change', this.eventHandler);
  }

  get = (): Theme => {
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
