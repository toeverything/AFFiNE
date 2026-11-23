import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import {
  EmbedIcon,
  FrameIcon,
  ImageIcon,
  PageIcon,
  ShapeIcon,
} from '@blocksuite/icons/lit';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

const BLOCK_PREVIEW_ICON_MAP: Record<
  string,
  {
    icon: typeof ShapeIcon;
    name: string;
  }
> = {
  shape: {
    icon: ShapeIcon,
    name: 'Edgeless shape',
  },
  'affine:image': {
    icon: ImageIcon,
    name: 'Image block',
  },
  'affine:note': {
    icon: PageIcon,
    name: 'Note block',
  },
  'affine:frame': {
    icon: FrameIcon,
    name: 'Frame block',
  },
  'affine:embed-': {
    icon: EmbedIcon,
    name: 'Embed block',
  },
};

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-dnd-preview-element': EdgelessDndPreviewElement;
  }
}

export const EDGELESS_DND_PREVIEW_ELEMENT = 'edgeless-dnd-preview-element';

export class EdgelessDndPreviewElement extends LitElement {
  static override styles = css`
    .edgeless-dnd-preview-container {
      position: relative;
      padding: 12px;
      width: 264px;
      height: 80px;
    }

    .edgeless-dnd-preview-block {
      display: flex;
      position: absolute;

      width: 234px;

      align-items: flex-start;
      box-sizing: border-box;

      border-radius: 8px;
      background-color: ${unsafeCSSVarV2(
        'layer/background/overlayPanel',
        '#FBFBFC'
      )};

      padding: 8px 20px;
      gap: 8px;

      transform-origin: center;

      font-family: var(--affine-font-family);
      box-shadow: 0px 0px 0px 0.5px #e3e3e4 inset;
    }

    .edgeless-dnd-preview-block > svg {
      color: ${unsafeCSSVarV2('icon/primary', '#77757D')};
    }

    .edgeless-dnd-preview-block > .text {
      color: ${unsafeCSSVarV2('text/primary', '#121212')};
      font-size: 14px;
      line-height: 24px;
    }
  `;

  @property({ type: Array })
  accessor elementTypes: {
    type: string;
  }[] = [];

  private _getPreviewIcon(type: string) {
    if (BLOCK_PREVIEW_ICON_MAP[type]) {
      return BLOCK_PREVIEW_ICON_MAP[type];
    }

    if (type.startsWith('affine:embed-')) {
      return BLOCK_PREVIEW_ICON_MAP['affine:embed-'];
    }

    return {
      icon: ShapeIcon,
      name: 'Edgeless content',
    };
  }

  override render() {
    const blocks = repeat(this.elementTypes.slice(0, 3), ({ type }, index) => {
      const { icon, name } = this._getPreviewIcon(type);

      return html`<div
        class="edgeless-dnd-preview-block"
        style=${styleMap({
          transform: `rotate(${index * -2}deg)`,
          zIndex: 3 - index,
        })}
      >
        ${icon({ width: '24px', height: '24px' })}
        <span class="text">${name}</span>
      </div>`;
    });

    return html`<div class="edgeless-dnd-preview-container">${blocks}</div>`;
  }
}
