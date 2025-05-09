import { Bound } from '@blocksuite/affine/global/gfx';
import { toGfxBlockComponent } from '@blocksuite/affine/std';
import { html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import { AIChatBlockComponent } from './ai-chat-block';

export class EdgelessAIChatBlockComponent extends toGfxBlockComponent(
  AIChatBlockComponent
) {
  override renderGfxBlock() {
    const bound = Bound.deserialize(this.model.props.xywh$.value);
    const scale = this.model.props.scale$.value;
    const width = bound.w / scale;
    const height = bound.h / scale;
    const style = {
      width: `${width}px`,
      height: `${height}px`,
      borderRadius: '8px',
      transformOrigin: '0 0',
      boxShadow: 'var(--affine-shadow-1)',
      border: '1px solid var(--affine-border-color)',
      transform: `scale(${scale})`,
    };

    return html`
      <div class="edgeless-ai-chat" style=${styleMap(style)}>
        ${this.renderPageContent()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-edgeless-ai-chat': EdgelessAIChatBlockComponent;
  }
}
