import type { Page as BlockSuitePage } from '@blocksuite/store';
import type { ServiceProvider } from '@toeverything/infra/di';

import type { PageMode, PageRecord } from './record';

export class Page {
  constructor(
    public readonly record: PageRecord,
    public readonly blockSuitePage: BlockSuitePage,
    public readonly services: ServiceProvider
  ) {}

  get id() {
    return this.record.id;
  }

  readonly mete = this.record.meta;
  readonly mode = this.record.mode;
  readonly title = this.record.title;

  setMode(mode: PageMode) {
    this.record.setMode(mode);
  }

  toggleMode() {
    this.record.toggleMode();
  }
}
