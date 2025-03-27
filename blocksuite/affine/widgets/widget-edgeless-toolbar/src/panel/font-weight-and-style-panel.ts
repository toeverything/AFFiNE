import { TextUtils } from '@blocksuite/affine-block-surface';
import {
  FontFamily,
  FontFamilyMap,
  FontStyle,
  FontWeight,
} from '@blocksuite/affine-model';
import { DoneIcon } from '@blocksuite/icons/lit';
import { css, html, LitElement, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { choose } from 'lit/directives/choose.js';
import { join } from 'lit/directives/join.js';
import { repeat } from 'lit/directives/repeat.js';

const FONT_WEIGHT_CHOOSE: [FontWeight, () => string][] = [
  [FontWeight.Light, () => 'Light'],
  [FontWeight.Regular, () => 'Regular'],
  [FontWeight.SemiBold, () => 'Semibold'],
];

export class EdgelessFontWeightAndStylePanel extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      align-items: start;
      flex-direction: column;
      min-width: 124px;
    }

    edgeless-tool-icon-button {
      width: 100%;
    }
  `;

  private _isActive(
    fontWeight: FontWeight,
    fontStyle: FontStyle = FontStyle.Normal
  ) {
    return this.fontWeight === fontWeight && this.fontStyle === fontStyle;
  }

  private _isDisabled(
    fontWeight: FontWeight,
    fontStyle: FontStyle = FontStyle.Normal
  ) {
    // Compatible with old data
    if (!(this.fontFamily in FontFamilyMap)) return false;

    const fontFace = TextUtils.getFontFaces()
      .filter(TextUtils.isSameFontFamily(this.fontFamily))
      .find(
        fontFace =>
          fontFace.weight === fontWeight && fontFace.style === fontStyle
      );

    return !fontFace;
  }

  private _onSelect(
    fontWeight: FontWeight,
    fontStyle: FontStyle = FontStyle.Normal
  ) {
    this.fontWeight = fontWeight;
    this.fontStyle = fontStyle;
    if (this.onSelect) {
      this.onSelect(fontWeight, fontStyle);
    }
  }

  override render() {
    let fontFaces = TextUtils.getFontFacesByFontFamily(this.fontFamily);
    // Compatible with old data
    if (fontFaces.length === 0) {
      fontFaces = TextUtils.getFontFacesByFontFamily(FontFamily.Inter);
    }
    const fontFacesWithNormal = fontFaces.filter(
      fontFace => fontFace.style === FontStyle.Normal
    );
    const fontFacesWithItalic = fontFaces.filter(
      fontFace => fontFace.style === FontStyle.Italic
    );

    return join(
      [
        fontFacesWithNormal.length > 0
          ? repeat(
              fontFacesWithNormal,
              fontFace => fontFace.weight,
              fontFace => {
                const active = this._isActive(fontFace.weight as FontWeight);
                return html`
                  <edgeless-tool-icon-button
                    data-weight="${fontFace.weight}"
                    .iconContainerPadding=${[4, 8]}
                    .justify=${'space-between'}
                    .disabled=${this._isDisabled(fontFace.weight as FontWeight)}
                    .active=${active}
                    .iconSize=${'20px'}
                    @click=${() =>
                      this._onSelect(fontFace.weight as FontWeight)}
                  >
                    ${choose(fontFace.weight, FONT_WEIGHT_CHOOSE)}
                    ${active ? DoneIcon() : nothing}
                  </edgeless-tool-icon-button>
                `;
              }
            )
          : nothing,
        fontFacesWithItalic.length > 0
          ? repeat(
              fontFacesWithItalic,
              fontFace => fontFace.weight,
              fontFace => {
                const active = this._isActive(
                  fontFace.weight as FontWeight,
                  FontStyle.Italic
                );
                return html`
                  <edgeless-tool-icon-button
                    data-weight="${fontFace.weight} italic"
                    .iconContainerPadding=${[4, 8]}
                    .justify=${'space-between'}
                    .disabled=${this._isDisabled(
                      fontFace.weight as FontWeight,
                      FontStyle.Italic
                    )}
                    .active=${active}
                    @click=${() =>
                      this._onSelect(
                        fontFace.weight as FontWeight,
                        FontStyle.Italic
                      )}
                  >
                    ${choose(fontFace.weight, FONT_WEIGHT_CHOOSE)} Italic
                    ${active ? DoneIcon() : nothing}
                  </edgeless-tool-icon-button>
                `;
              }
            )
          : nothing,
      ].filter(item => item !== nothing),
      () => html`
        <edgeless-menu-divider
          data-orientation="horizontal"
        ></edgeless-menu-divider>
      `
    );
  }

  @property({ attribute: false })
  accessor fontFamily = FontFamily.Inter;

  @property({ attribute: false })
  accessor fontStyle = FontStyle.Normal;

  @property({ attribute: false })
  accessor fontWeight = FontWeight.Regular;

  @property({ attribute: false })
  accessor onSelect:
    | ((fontWeight: FontWeight, fontStyle: FontStyle) => void)
    | undefined;
}
