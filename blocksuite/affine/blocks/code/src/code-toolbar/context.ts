import { MenuContext } from '@blocksuite/affine-components/toolbar';

import type { CodeBlockComponent } from '../code-block';

export class CodeBlockToolbarContext extends MenuContext {
  override close = () => {
    this.abortController.abort();
  };

  get doc() {
    return this.blockComponent.store;
  }

  get host() {
    return this.blockComponent.host;
  }

  get selectedBlockModels() {
    if (this.blockComponent.model) return [this.blockComponent.model];
    return [];
  }

  get std() {
    return this.blockComponent.std;
  }

  constructor(
    public blockComponent: CodeBlockComponent,
    public abortController: AbortController,
    public setActive: (active: boolean) => void
  ) {
    super();
  }

  isEmpty() {
    return false;
  }

  isMultiple() {
    return false;
  }

  isSingle() {
    return true;
  }
}
