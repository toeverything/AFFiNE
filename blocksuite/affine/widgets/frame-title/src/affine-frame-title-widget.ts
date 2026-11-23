import { type FrameBlockModel } from '@blocksuite/affine-model';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/std';
import { html } from 'lit';
import { literal, unsafeStatic } from 'lit/static-html.js';

export const AFFINE_FRAME_TITLE_WIDGET = 'affine-frame-title-widget';

export class AffineFrameTitleWidget extends WidgetComponent<FrameBlockModel> {
  override render() {
    return html`<affine-frame-title
      .model=${this.model}
      data-id=${this.model.id}
    ></affine-frame-title>`;
  }
}

export const frameTitleWidget = WidgetViewExtension(
  'affine:frame',
  AFFINE_FRAME_TITLE_WIDGET,
  literal`${unsafeStatic(AFFINE_FRAME_TITLE_WIDGET)}`
);
