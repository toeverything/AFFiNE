import { BaseProvider } from './base.js';

export class MemoryProvider extends BaseProvider {
  constructor() {
    super();
  }

  async initData() {
    console.log('Skip data reload in memory provider');
  }
}
