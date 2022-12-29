import { IdbInstance } from './store.js';

export interface DCProvider {
  id: string;
  init(config: IdbInstance<any>): void;
}

export class MemoryProvider implements DCProvider {
  static readonly id = 'memory';
  private _config: IdbInstance<any> | undefined;

  constructor() {
    // TODO
  }

  init(config: IdbInstance<any>) {
    this._config = config;
  }
}
