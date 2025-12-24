import { ColorScheme } from '@blocksuite/affine-model';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { DeleteIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { type GfxModel } from '@blocksuite/std/gfx';
import { css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import { DarkDeletedSmallBanner, LightDeletedSmallBanner } from '../icons';
import { getReferenceModelTitle, TYPE_ICON_MAP } from '../utils';

export class SurfaceRefPlaceHolder extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .surface-ref-placeholder {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
    }

    .surface-ref-placeholder.not-found {
      background: ${unsafeCSSVarV2('layer/background/secondary', '#F5F5F5')};
    }

    .surface-ref-placeholder-heading {
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      align-self: stretch;

      font-size: 14px;
      font-weight: 500;
      line-height: 22px;

      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;

      color: ${unsafeCSSVarV2('text/primary', '#141414')};
    }

    .surface-ref-placeholder-body {
      position: relative;
      font-size: 12px;
      font-weight: 400;
      line-height: 20px;
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
      color: ${unsafeCSSVarV2('text/disable', '#7a7a7a')};
    }

    .surface-ref-not-found-background {
      position: absolute;
      right: 12px;
      bottom: -5px;
    }
  `;

  @property({ attribute: false })
  accessor referenceModel: GfxModel | null = null;

  @property({ attribute: false })
  accessor refFlavour = '';

  @property({ attribute: false })
  accessor inEdgeless = false;

  @property({ attribute: false })
  accessor theme: ColorScheme = ColorScheme.Light;

  override render() {
    const { referenceModel, refFlavour, inEdgeless } = this;

    // When surface ref is in page mode and reference exists, don't render placeholder
    if (referenceModel && !inEdgeless) return nothing;

    const modelNotFound = !referenceModel;
    const matchedType = TYPE_ICON_MAP[refFlavour] ?? TYPE_ICON_MAP['edgeless'];

    const title =
      (referenceModel && getReferenceModelTitle(referenceModel)) ??
      matchedType.name;

    const notFoundBackground =
      this.theme === ColorScheme.Light
        ? LightDeletedSmallBanner
        : DarkDeletedSmallBanner;

    return html`
      <div
        class=${classMap({
          'surface-ref-placeholder': true,
          'not-found': modelNotFound,
        })}
      >
        ${modelNotFound
          ? html`<div class="surface-ref-not-found-background">
              ${notFoundBackground}
            </div>`
          : nothing}
        <div class="surface-ref-placeholder-heading">
          ${modelNotFound ? DeleteIcon() : matchedType.icon}
          <span class="surface-ref-title">
            ${modelNotFound
              ? `This ${matchedType.name} not available`
              : `${title}`}
          </span>
        </div>
        <div class="surface-ref-placeholder-body">
          <span class="surface-ref-text">
            ${modelNotFound
              ? `The ${matchedType.name.toLowerCase()} is deleted or not in this doc.`
              : `The ${matchedType.name.toLowerCase()} is inserted but cannot display in edgeless mode. Switch to page mode to view the block.`}
          </span>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'surface-ref-placeholder': SurfaceRefPlaceHolder;
  }
}
