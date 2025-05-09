import {
  FrameBlockModel,
  GroupElementModel,
  MindmapElementModel,
  ShapeElementModel,
} from '@blocksuite/affine-model';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import {
  EdgelessIcon,
  FrameIcon,
  GroupIcon,
  MindmapIcon,
} from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { GfxModel } from '@blocksuite/std/gfx';
import { css, html, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

export class SurfaceRefToolbarTitle extends ShadowlessElement {
  static override styles = css`
    surface-ref-toolbar-title {
      display: flex;
      padding: 2px 4px;
      margin-right: auto;
      align-items: center;
      gap: 4px;
      border-radius: 4px;
      color: ${unsafeCSSVarV2('text/primary')};
      box-shadow: ${unsafeCSSVar('buttonShadow')};
      background: ${unsafeCSSVar('white')};

      svg {
        color: ${unsafeCSSVarV2('icon/primary')};
        width: 16px;
        height: 16px;
      }

      span {
        color: ${unsafeCSSVarV2('text/primary')};
        font-size: 12px;
        font-weight: 500;
        line-height: 20px;
      }
    }
  `;

  @property({ attribute: false })
  accessor referenceModel: GfxModel | null = null;

  override render() {
    const { referenceModel } = this;
    let title = '';
    let icon: TemplateResult = EdgelessIcon();
    if (referenceModel instanceof GroupElementModel) {
      title = referenceModel.title.toString();
      icon = GroupIcon();
    } else if (referenceModel instanceof FrameBlockModel) {
      title = referenceModel.props.title.toString();
      icon = FrameIcon();
    } else if (referenceModel instanceof MindmapElementModel) {
      const rootElement = referenceModel.tree.element;
      if (rootElement instanceof ShapeElementModel) {
        title = rootElement.text?.toString() ?? '';
      }
      icon = MindmapIcon();
    }

    return html`${icon}<span>${title}</span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'surface-ref-toolbar-title': SurfaceRefToolbarTitle;
  }
}
