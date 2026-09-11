import { I18n } from '@affine/i18n';
import { BlockComponent } from '@blocksuite/affine/std';
import { html } from 'lit';

import type { HelloBlockModel } from './model';
import { helloBlockStyles } from './styles';

export class HelloBlockComponent extends BlockComponent<HelloBlockModel> {
  static override styles = helloBlockStyles;

  protected renderContent(preview = false) {
    const snapshotBlobId = this.model.props.snapshotBlobId$.value;
    const title =
      this.model.props.title$.value ||
      I18n['com.affine.whiteboard.hello.title']();

    if (snapshotBlobId) {
      return html`<img
        class="wb-hello__snapshot"
        src=${snapshotBlobId}
        alt=${title}
      />`;
    }

    return html`
      <div class="wb-hello">
        <div class="wb-hello__kicker">
          ${
            preview
              ? I18n['com.affine.whiteboard.hello.preview-label']()
              : 'wb:hello'
          }
        </div>
        <div class="wb-hello__title">${title}</div>
      </div>
    `;
  }

  override renderBlock() {
    return this.renderContent(false);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wb-hello': HelloBlockComponent;
  }
}
