import { BaseProvider } from './base.js';

export class MemoryProvider extends BaseProvider {
  constructor() {
    super();
  }

  test() {
    console.log(this._config, this._workspace);
  }
}
