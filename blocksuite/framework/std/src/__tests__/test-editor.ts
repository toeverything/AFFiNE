import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import type { ExtensionType, Store } from '@blocksuite/store';
import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { BlockStdScope } from '../scope/index.js';
import { ShadowlessElement } from '../view/index.js';

@customElement('test-editor-container')
export class TestEditorContainer extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  private _std!: BlockStdScope;

  get std() {
    return this._std;
  }

  override connectedCallback() {
    super.connectedCallback();
    this._std = new BlockStdScope({
      store: this.doc,
      extensions: this.specs,
    });
  }

  protected override render() {
    return html` <div class="test-editor-container">
      ${this._std.render()}
    </div>`;
  }

  @property({ attribute: false })
  accessor doc!: Store;

  @property({ attribute: false })
  accessor specs: ExtensionType[] = [];
}
