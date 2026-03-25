import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import { STENCIL_SHAPE_NAMES } from '@blocksuite/affine-gfx-shape';
import {
  ConnectorElementModel,
  ConnectorLabelOffsetAnchor,
  ConnectorMode,
  FontFamilyList,
  FontStyle,
  FontWeight,
  getConnectorModeName,
  isTransparent,
  LineWidth,
  ShapeElementModel,
  ShapeStyle,
  ShapeType,
  StrokeStyle,
  TextAlign,
  TextResizing,
  TextVerticalAlign,
} from '@blocksuite/affine-model';
import { fontSMStyle, fontXSStyle } from '@blocksuite/affine-shared/styles';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { deserializeXYWH, serializeXYWH } from '@blocksuite/global/gfx';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import type { EditorHost } from '@blocksuite/std';
import type { GfxModel } from '@blocksuite/std/gfx';
import { type ReferenceElement } from '@floating-ui/dom';
import { css, html, LitElement, svg } from 'lit';
import { property } from 'lit/decorators.js';

const GRADIENT_DIRECTIONS = [
  'S',
  'W',
  'N',
  'E',
  'SE',
  'SW',
  'NE',
  'NW',
] as const;
const SHAPE_TYPE_OPTIONS = Object.values(ShapeType);
const SHAPE_STYLE_OPTIONS = Object.values(ShapeStyle);
const STROKE_STYLE_OPTIONS = Object.values(StrokeStyle);
const LINE_WIDTH_OPTIONS = Object.values(LineWidth).filter(
  value => typeof value === 'number'
) as LineWidth[];
const TEXT_ALIGN_OPTIONS = Object.values(TextAlign);
const TEXT_VERTICAL_ALIGN_OPTIONS = Object.values(TextVerticalAlign);
const FONT_STYLE_OPTIONS = Object.values(FontStyle);
const FONT_WEIGHT_OPTIONS = Object.values(FontWeight);
const TEXT_RESIZING_OPTIONS: { value: TextResizing; label: string }[] = [
  { value: TextResizing.NONE, label: 'None' },
  { value: TextResizing.AUTO_WIDTH, label: 'Auto width' },
  { value: TextResizing.AUTO_HEIGHT, label: 'Auto height' },
  {
    value: TextResizing.AUTO_WIDTH_AND_HEIGHT,
    label: 'Auto width and height',
  },
];
const CONNECTOR_MODE_OPTIONS = [
  ConnectorMode.Straight,
  ConnectorMode.Orthogonal,
  ConnectorMode.Curve,
  ConnectorMode.Rounded,
];
const DRAWIO_MARKERS = [
  'classic',
  'classicThin',
  'open',
  'openThin',
  'block',
  'blockThin',
  'oval',
  'diamond',
  'diamondThin',
  'doubleBlock',
  'box',
  'halfCircle',
  'openAsync',
  'async',
  'dash',
  'baseDash',
  'cross',
  'circle',
  'circlePlus',
  'ERone',
  'ERmandOne',
  'ERmany',
  'ERoneToMany',
  'ERzeroToOne',
  'ERzeroToMany',
] as const;
const CONNECTOR_ENDPOINT_OPTIONS = [
  { value: 'None', label: 'None' },
  { value: 'Arrow', label: 'Arrow' },
  { value: 'Triangle', label: 'Triangle' },
  { value: 'Circle', label: 'Circle' },
  { value: 'Diamond', label: 'Diamond' },
  ...DRAWIO_MARKERS.map(value => ({ value, label: labelize(value) })),
];

const MARKER_ICON_PATHS: Record<
  string,
  { path: string; filled?: boolean; strokeOnly?: boolean }
> = {
  None: { path: 'M 2 10 L 30 10', strokeOnly: true },
  Arrow: { path: 'M 2 10 L 10 5 L 10 15 Z', filled: true },
  Triangle: { path: 'M 2 10 L 9 6 L 9 14 Z', filled: true },
  Circle: {
    path: 'M 6 10 A 4 4 0 0 1 10 6 A 4 4 0 0 1 14 10 A 4 4 0 0 1 10 14 A 4 4 0 0 1 6 10 Z',
    filled: true,
  },
  Diamond: { path: 'M 4 10 L 8 6 L 12 10 L 8 14 Z', filled: true },
  classic: { path: 'M 0 8 L 10 2 L 5 8 L 10 14 Z', filled: true },
  classicThin: { path: 'M 0 8 L 8 4 L 5 8 L 8 12 Z', filled: true },
  open: { path: 'M 8 0 L 0 8 L 8 16', strokeOnly: true },
  openThin: { path: 'M 8 4 L 0 8 L 8 12', strokeOnly: true },
  block: { path: 'M 0 8 L 8 2 L 8 14 Z', filled: true },
  blockThin: { path: 'M 0 8 L 8 4 L 8 12 Z', filled: true },
  oval: {
    path: 'M 0 8 A 5 5 0 0 1 5 3 A 5 5 0 0 1 11 8 A 5 5 0 0 1 5 13 A 5 5 0 0 1 0 8 Z',
    filled: true,
  },
  diamond: { path: 'M 0 8 L 6 2 L 12 8 L 6 14 Z', filled: true },
  diamondThin: { path: 'M 0 8 L 8 3 L 16 8 L 8 13 Z', filled: true },
  doubleBlock: {
    path: 'M 0 8 L 8 2 L 8 14 Z M 8 8 L 16 2 L 16 14 Z',
    filled: true,
  },
  box: { path: 'M 0 3 L 10 3 L 10 13 L 0 13 Z', filled: true },
  halfCircle: {
    path: 'M 0 3 A 5 5 0 0 1 5 8 A 5 5 0 0 1 0 13',
    strokeOnly: true,
  },
  openAsync: { path: 'M 8 4 L 0 8 L 24 8', strokeOnly: true },
  async: { path: 'M 6 8 L 6 4 L 0 8 L 24 8', filled: true },
  dash: { path: 'M 0 2 L 12 14', strokeOnly: true },
  baseDash: { path: 'M 0 2 L 0 14', strokeOnly: true },
  cross: { path: 'M 0 2 L 12 14 M 12 2 L 0 14', strokeOnly: true },
  circle: {
    path: 'M 0 8 A 6 6 0 0 1 6 2 A 6 6 0 0 1 12 8 A 6 6 0 0 1 6 14 A 6 6 0 0 1 0 8 Z',
    strokeOnly: true,
  },
  circlePlus: {
    path: 'M 0 8 A 6 6 0 0 1 6 2 A 6 6 0 0 1 12 8 A 6 6 0 0 1 6 14 A 6 6 0 0 1 0 8 Z M 6 2 L 6 14',
    strokeOnly: true,
  },
  ERone: { path: 'M 5 2 L 5 14', strokeOnly: true },
  ERmandOne: { path: 'M 6 2 L 6 14 M 9 2 L 9 14', strokeOnly: true },
  ERmany: { path: 'M 0 2 L 12 8 L 0 14', strokeOnly: true },
  ERoneToMany: { path: 'M 0 2 L 12 8 L 0 14 M 15 2 L 15 14', strokeOnly: true },
  ERzeroToOne: {
    path: 'M 8 8 A 5 5 0 0 1 13 3 A 5 5 0 0 1 18 8 A 5 5 0 0 1 13 13 A 5 5 0 0 1 8 8 Z M 4 3 L 4 13',
    strokeOnly: true,
  },
  ERzeroToMany: {
    path: 'M 8 8 A 5 5 0 0 1 13 3 A 5 5 0 0 1 18 8 A 5 5 0 0 1 13 13 A 5 5 0 0 1 8 8 Z M 0 3 L 8 8 L 0 13',
    strokeOnly: true,
  },
};

function renderMarkerIcon(value: string) {
  const marker = MARKER_ICON_PATHS[value];
  if (!marker) return html``;
  const fill = marker.strokeOnly ? 'none' : 'currentColor';
  return svg`<svg viewBox="0 0 32 20" width="28" height="16" aria-hidden="true">
    <path
      d=${marker.path}
      stroke="currentColor"
      stroke-width="1.5"
      fill=${fill}
      stroke-linecap="round"
      stroke-linejoin="round"
      transform="translate(4,2)"
    />
  </svg>`;
}

function labelize(value: string) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, char => char.toUpperCase())
    .trim();
}

function getLabelForKey(key: string) {
  if (key === 'color') return 'Text color';
  if (key === 'text') return 'Text';
  return labelize(key);
}

function isColorString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
  );
}

export class PropertiesModal extends SignalWatcher(WithDisposable(LitElement)) {
  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: var(--affine-z-index-popover);
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 0 16px;
      overflow: auto;
      box-sizing: border-box;
      pointer-events: auto;
      background: rgba(0, 0, 0, 0.08);
      animation: affine-popover-fade-in 0.2s ease;
    }

    :host([data-in-peek='true']) {
      position: absolute;
      z-index: 9999;
    }

    @keyframes affine-popover-fade-in {
      from {
        opacity: 0;
        transform: translateY(-3px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .properties-modal-wrapper {
      display: flex;
      flex-direction: column;
      align-self: flex-start;
      margin-top: 120px;
      padding: 20px 0;
      width: min(480px, 100%);
      min-width: min(360px, 100%);
      max-width: 480px;
      max-height: calc(100dvh - 240px);
      overflow: auto;
      box-sizing: border-box;

      color: var(--affine-icon-color);
      box-shadow: var(--affine-overlay-shadow);
      background: ${unsafeCSSVarV2('layer/background/overlayPanel')};
      border-radius: 8px;
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      pointer-events: auto;
    }

    .properties-modal-content {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: flex-start;
      gap: 8px;
      width: 100%;
      padding: 0 24px;
      box-sizing: border-box;
    }

    .header {
      width: 100%;
      display: flex;
      justify-content: flex-start;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
    }

    .title {
      font-weight: 600;
      color: var(--affine-text-primary-color);
    }
    ${fontSMStyle('.title')}

    .property-row {
      width: 100%;
      display: grid;
      grid-template-columns: 140px 1fr;
      align-items: center;
      gap: 8px;
    }

    .property-row.multiline {
      align-items: start;
    }

    .property-section {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 4px;
    }

    .property-section-title {
      color: var(--affine-text-primary-color);
      font-weight: 600;
      margin-top: 6px;
    }
    ${fontSMStyle('.property-section-title')}

    .property-label {
      color: var(--affine-text-secondary-color);
      font-weight: 500;
    }
    ${fontXSStyle('.property-label')}

    .property-input {
      display: flex;
      padding: 6px 10px;
      width: 100%;
      box-sizing: border-box;
      border-radius: 4px;
      background: transparent;
      border: 1px solid ${unsafeCSSVarV2('input/border/default')};
      color: var(--affine-text-primary-color);
    }
    ${fontSMStyle('.property-input')}

    .property-input:focus {
      border-color: ${unsafeCSSVarV2('input/border/active')};
      outline: none;
    }

    .property-input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .property-select {
      padding: 6px 10px;
      width: 100%;
      box-sizing: border-box;
      border-radius: 4px;
      background: transparent;
      border: 1px solid ${unsafeCSSVarV2('input/border/default')};
      color: var(--affine-text-primary-color);
      cursor: pointer;
    }
    ${fontSMStyle('.property-select')}

    .property-select:focus {
      border-color: ${unsafeCSSVarV2('input/border/active')};
      outline: none;
    }

    .color-input-wrapper {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .property-textarea {
      min-height: 72px;
      resize: vertical;
    }

    .marker-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px;
      align-items: center;
    }

    .marker-button {
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      gap: 8px;
      border-radius: 6px;
      border: 1px solid ${unsafeCSSVarV2('input/border/default')};
      background: transparent;
      color: var(--affine-text-primary-color);
      cursor: pointer;
    }

    .marker-button-label {
      flex: 1;
      text-align: left;
    }

    .marker-dropdown {
      width: 100%;
    }

    .marker-summary {
      list-style: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid ${unsafeCSSVarV2('input/border/default')};
      border-radius: 6px;
      padding: 6px 8px;
    }

    .marker-summary::-webkit-details-marker {
      display: none;
    }

    .marker-button[data-selected='true'] {
      border-color: ${unsafeCSSVarV2('input/border/active')};
      background: ${unsafeCSSVarV2('layer/background/secondary')};
    }

    .color-preview {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      cursor: pointer;
    }

    .checkbox-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    input[type='checkbox'] {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }
  `;

  private readonly _hide = () => {
    this.remove();
    this.abortController?.abort();
  };

  private readonly _updateProperty = (key: string, value: any) => {
    if (!this.model) return;

    const crud = this.host.std.get(EdgelessCRUDIdentifier);
    if (this.model instanceof ShapeElementModel && key === 'radius') {
      const nextValue = Number(value);
      if (!Number.isFinite(nextValue)) return;
      const clamped = Math.max(0, Math.min(1, nextValue));
      crud.updateElement(this.model.id, { radius: clamped });
      return;
    }
    if (this.model instanceof ShapeElementModel && key === 'textResizing') {
      const nextValue = Number(value) as TextResizing;
      if (!Number.isFinite(nextValue)) return;
      const shapeModel = this.model as ShapeElementModel & {
        yMap?: { set?: (key: string, value: unknown) => void };
      };
      shapeModel.yMap?.set?.('textResizing', nextValue);
      this.model.textResizing = nextValue;
      crud.updateElement(this.model.id, { textResizing: nextValue });
      this.requestUpdate();
      return;
    }

    if (this.model instanceof ShapeElementModel && key === 'fillColor') {
      const filled = !isTransparent(value);
      crud.updateElement(this.model.id, { [key]: value, filled });
      return;
    }
    crud.updateElement(this.model.id, { [key]: value });
  };

  private readonly _updateProperties = (props: Record<string, unknown>) => {
    if (!this.model) return;
    const crud = this.host.std.get(EdgelessCRUDIdentifier);
    crud.updateElement(this.model.id, props);
  };

  private _renderSection(title: string, content: unknown) {
    return html`
      <div class="property-section">
        <div class="property-section-title">${title}</div>
        ${content}
      </div>
    `;
  }

  private _renderTextRow(
    label: string,
    value: string,
    onChange: (value: string) => void
  ) {
    return html`
      <div class="property-row">
        <label class="property-label">${label}</label>
        <input
          type="text"
          class="property-input"
          .value=${value}
          @input=${(e: Event) => {
            const target = e.target as HTMLInputElement;
            onChange(target.value);
          }}
        />
      </div>
    `;
  }

  private _renderTextareaRow(
    label: string,
    value: string,
    onChange: (value: string) => void
  ) {
    return html`
      <div class="property-row multiline">
        <label class="property-label">${label}</label>
        <textarea
          class="property-input property-textarea"
          .value=${value}
          @input=${(e: Event) => {
            const target = e.target as HTMLTextAreaElement;
            onChange(target.value);
          }}
        ></textarea>
      </div>
    `;
  }

  private _renderNumberRow(
    label: string,
    value: number,
    onChange: (value: number) => void,
    options: { min?: number; max?: number; step?: number } = {}
  ) {
    const { min, max, step } = options;
    return html`
      <div class="property-row">
        <label class="property-label">${label}</label>
        <input
          type="number"
          class="property-input"
          .min=${min ?? ''}
          .max=${max ?? ''}
          .step=${step ?? ''}
          .value=${Number.isFinite(value) ? value.toString() : ''}
          @input=${(e: Event) => {
            const target = e.target as HTMLInputElement;
            const nextValue = Number(target.value);
            if (!Number.isNaN(nextValue)) {
              onChange(nextValue);
            }
          }}
        />
      </div>
    `;
  }

  private _renderSelectRow(
    label: string,
    value: string | number,
    options: Array<{ value: string | number; label: string }>,
    onChange: (value: string) => void
  ) {
    return html`
      <div class="property-row">
        <label class="property-label">${label}</label>
        <select
          class="property-select"
          .value=${String(value)}
          @change=${(e: Event) => {
            const target = e.target as HTMLSelectElement;
            onChange(target.value);
          }}
        >
          ${options.map(
            option =>
              html`<option value=${String(option.value)}>
                ${option.label}
              </option>`
          )}
        </select>
      </div>
    `;
  }

  private _renderMarkerPicker(
    label: string,
    value: string,
    onChange: (value: string) => void
  ) {
    const activeOption =
      CONNECTOR_ENDPOINT_OPTIONS.find(option => option.value === value) ??
      CONNECTOR_ENDPOINT_OPTIONS[0];
    return html`
      <div class="property-row multiline">
        <label class="property-label">${label}</label>
        <details class="marker-dropdown">
          <summary class="marker-summary">
            ${renderMarkerIcon(activeOption.value)}
            <span class="marker-button-label">${activeOption.label}</span>
          </summary>
          <div class="marker-grid">
            ${CONNECTOR_ENDPOINT_OPTIONS.map(option => {
              const selected = option.value === value;
              return html`
                <button
                  class="marker-button"
                  data-selected=${selected}
                  title=${option.label}
                  type="button"
                  @click=${(e: Event) => {
                    const details = (e.currentTarget as HTMLElement).closest(
                      'details'
                    );
                    if (details) details.open = false;
                    onChange(option.value);
                  }}
                >
                  ${renderMarkerIcon(option.value)}
                  <span class="marker-button-label">${option.label}</span>
                </button>
              `;
            })}
          </div>
        </details>
      </div>
    `;
  }

  private _renderCheckboxRow(
    label: string,
    checked: boolean,
    onChange: (value: boolean) => void
  ) {
    return html`
      <div class="property-row">
        <label class="property-label">${label}</label>
        <div class="checkbox-wrapper">
          <input
            type="checkbox"
            .checked=${checked}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              onChange(target.checked);
            }}
          />
        </div>
      </div>
    `;
  }

  private _renderColorRow(
    label: string,
    value: string | { normal: string } | { dark: string; light: string },
    onChange: (value: string) => void
  ) {
    const resolvedValue =
      typeof value === 'string'
        ? value
        : 'normal' in value
          ? value.normal
          : value.light;
    return html`
      <div class="property-row">
        <label class="property-label">${label}</label>
        <div class="color-input-wrapper">
          <div
            class="color-preview"
            style="background-color: ${resolvedValue}"
            @click=${(e: Event) => {
              const input = (e.target as HTMLElement)
                .nextElementSibling as HTMLInputElement;
              input?.click();
            }}
          ></div>
          <input
            type="color"
            class="property-input"
            .value=${resolvedValue}
            @input=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              onChange(target.value);
            }}
          />
        </div>
      </div>
    `;
  }

  private _renderJsonRow(
    label: string,
    value: unknown,
    onChange: (value: unknown) => void
  ) {
    const json = JSON.stringify(value, null, 2) ?? '';
    return html`
      <div class="property-row multiline">
        <label class="property-label">${label}</label>
        <textarea
          class="property-input property-textarea"
          .value=${json}
          @change=${(e: Event) => {
            const target = e.target as HTMLTextAreaElement;
            try {
              onChange(JSON.parse(target.value));
              target.setCustomValidity('');
            } catch {
              target.setCustomValidity('Invalid JSON');
            }
          }}
        ></textarea>
      </div>
    `;
  }

  private _renderAutoProperties(model: GfxModel, ignoreKeys: Set<string>) {
    const rawProps =
      'yMap' in model
        ? ((
            model as { yMap?: { toJSON?: () => Record<string, unknown> } }
          ).yMap?.toJSON?.() ?? {})
        : {};
    const entries = Object.entries(rawProps).filter(
      ([key]) => !ignoreKeys.has(key)
    );
    if (entries.length === 0) return null;

    return entries.map(([key, value]) => {
      if (typeof value === 'boolean') {
        return this._renderCheckboxRow(getLabelForKey(key), value, nextValue =>
          this._updateProperty(key, nextValue)
        );
      }

      if (typeof value === 'number') {
        return this._renderNumberRow(getLabelForKey(key), value, nextValue =>
          this._updateProperty(key, nextValue)
        );
      }

      if (isColorString(value)) {
        return this._renderColorRow(getLabelForKey(key), value, nextValue =>
          this._updateProperty(key, nextValue)
        );
      }

      if (typeof value === 'string') {
        return this._renderTextRow(getLabelForKey(key), value, nextValue =>
          this._updateProperty(key, nextValue)
        );
      }

      return this._renderJsonRow(getLabelForKey(key), value, nextValue =>
        this._updateProperty(key, nextValue)
      );
    });
  }

  private _renderShapeProperties(model: ShapeElementModel) {
    const [x, y, w, h] = deserializeXYWH(model.xywh);
    const gradientColor = model.gradientFinal ?? model.fillColor;
    const textValue = model.text?.toString() ?? '';
    const shadowEnabled = Boolean(model.shadow);
    const shadowValue = model.shadow ?? {
      blur: 4,
      offsetX: 0,
      offsetY: 2,
      color: model.strokeColor,
    };
    const knownKeys = new Set([
      'shapeType',
      'fillColor',
      'gradientFinal',
      'gradientDirection',
      'strokeColor',
      'strokeWidth',
      'strokeStyle',
      'shapeStyle',
      'filled',
      'radius',
      'rotate',
      'flipX',
      'flipY',
      'lockAspectRatio',
      'xywh',
      'index',
      'lockedBySelf',
      'roughness',
      'color',
      'fontFamily',
      'fontSize',
      'fontStyle',
      'fontWeight',
      'textAlign',
      'textHorizontalAlign',
      'textVerticalAlign',
      'textResizing',
      'maxWidth',
      'padding',
      'text',
      'textRotate',
      'textFlipX',
      'textFlipY',
      'shadow',
      'stencilName',
    ]);

    return html`
      ${this._renderSection(
        'Core',
        html`
          ${this._renderSelectRow(
            'Shape type',
            model.shapeType,
            SHAPE_TYPE_OPTIONS.map(value => ({
              value,
              label: labelize(value),
            })),
            value => this._updateProperty('shapeType', value)
          )}
          ${this._renderSelectRow(
            'Shape style',
            model.shapeStyle,
            SHAPE_STYLE_OPTIONS.map(value => ({
              value,
              label: labelize(value),
            })),
            value => this._updateProperty('shapeStyle', value)
          )}
          ${this._renderColorRow('Fill', model.fillColor, value =>
            this._updateProperty('fillColor', value)
          )}
          ${this._renderCheckboxRow(
            'Gradient enabled',
            Boolean(model.gradientFinal),
            enabled =>
              this._updateProperty(
                'gradientFinal',
                enabled ? model.fillColor : undefined
              )
          )}
          ${this._renderColorRow('Gradient end', gradientColor, value =>
            this._updateProperty('gradientFinal', value)
          )}
          ${this._renderSelectRow(
            'Gradient direction',
            model.gradientDirection ?? 'none',
            [
              { value: 'none', label: 'None' },
              ...GRADIENT_DIRECTIONS.map(value => ({ value, label: value })),
            ],
            value =>
              this._updateProperty(
                'gradientDirection',
                value === 'none' ? undefined : value
              )
          )}
          ${this._renderCheckboxRow('Filled', model.filled, value =>
            this._updateProperty('filled', value)
          )}
          ${this._renderColorRow('Stroke', model.strokeColor, value =>
            this._updateProperty('strokeColor', value)
          )}
          ${this._renderSelectRow(
            'Stroke width',
            model.strokeWidth,
            LINE_WIDTH_OPTIONS.map(value => ({
              value,
              label: `${value}`,
            })),
            value => this._updateProperty('strokeWidth', Number(value))
          )}
          ${this._renderSelectRow(
            'Stroke style',
            model.strokeStyle,
            STROKE_STYLE_OPTIONS.map(value => ({
              value,
              label: labelize(value),
            })),
            value => this._updateProperty('strokeStyle', value)
          )}
          ${this._renderNumberRow(
            'Corner radius',
            model.radius,
            value => this._updateProperty('radius', value),
            { min: 0, max: 1, step: 0.01 }
          )}
          ${this._renderNumberRow(
            'Rotate',
            model.rotate,
            value => this._updateProperty('rotate', value),
            { step: 1 }
          )}
          ${this._renderCheckboxRow(
            'Flip horizontal',
            model.flipX ?? false,
            value => this._updateProperty('flipX', value)
          )}
          ${this._renderCheckboxRow(
            'Flip vertical',
            model.flipY ?? false,
            value => this._updateProperty('flipY', value)
          )}
          ${this._renderNumberRow('X', x, value =>
            this._updateProperty('xywh', serializeXYWH(value, y, w, h))
          )}
          ${this._renderNumberRow('Y', y, value =>
            this._updateProperty('xywh', serializeXYWH(x, value, w, h))
          )}
          ${this._renderNumberRow('Width', w, value =>
            this._updateProperty('xywh', serializeXYWH(x, y, value, h))
          )}
          ${this._renderNumberRow('Height', h, value =>
            this._updateProperty('xywh', serializeXYWH(x, y, w, value))
          )}
          ${this._renderCheckboxRow(
            'Lock aspect ratio',
            model.lockAspectRatio ?? false,
            value => this._updateProperty('lockAspectRatio', value)
          )}
          ${this._renderSelectRow(
            'Stencil name',
            model.stencilName ?? 'none',
            [
              { value: 'none', label: 'None' },
              ...STENCIL_SHAPE_NAMES.map(name => ({
                value: name,
                label: name,
              })),
            ],
            value =>
              this._updateProperty(
                'stencilName',
                value === 'none' ? undefined : value
              )
          )}
          ${this._renderCheckboxRow('Shadow', shadowEnabled, value =>
            this._updateProperty('shadow', value ? shadowValue : null)
          )}
          ${shadowEnabled
            ? html`
                ${this._renderNumberRow(
                  'Shadow blur',
                  shadowValue.blur,
                  value =>
                    this._updateProperty('shadow', {
                      ...shadowValue,
                      blur: value,
                    })
                )}
                ${this._renderNumberRow(
                  'Shadow offset X',
                  shadowValue.offsetX,
                  value =>
                    this._updateProperty('shadow', {
                      ...shadowValue,
                      offsetX: value,
                    })
                )}
                ${this._renderNumberRow(
                  'Shadow offset Y',
                  shadowValue.offsetY,
                  value =>
                    this._updateProperty('shadow', {
                      ...shadowValue,
                      offsetY: value,
                    })
                )}
                ${this._renderColorRow(
                  'Shadow color',
                  shadowValue.color,
                  value =>
                    this._updateProperty('shadow', {
                      ...shadowValue,
                      color: value,
                    })
                )}
              `
            : null}
          ${this._renderTextRow('Z index', model.index, value =>
            this._updateProperty('index', value)
          )}
          ${this._renderCheckboxRow('Movable', !model.lockedBySelf, value =>
            this._updateProperty('lockedBySelf', !value)
          )}
        `
      )}
      ${this._renderSection(
        'Text',
        html`
          ${this._renderTextareaRow('Text', textValue, value =>
            this._updateProperty('text', value)
          )}
          ${this._renderColorRow('Text color', model.color, value =>
            this._updateProperty('color', value)
          )}
          ${this._renderSelectRow(
            'Font family',
            model.fontFamily,
            FontFamilyList.map(([value, label]) => ({ value, label })),
            value => this._updateProperty('fontFamily', value)
          )}
          ${this._renderNumberRow(
            'Font size',
            model.fontSize,
            value => this._updateProperty('fontSize', value),
            { min: 1, max: 200, step: 1 }
          )}
          ${this._renderSelectRow(
            'Font weight',
            model.fontWeight,
            FONT_WEIGHT_OPTIONS.map(value => ({
              value,
              label: labelize(value),
            })),
            value => this._updateProperty('fontWeight', value)
          )}
          ${this._renderSelectRow(
            'Font style',
            model.fontStyle,
            FONT_STYLE_OPTIONS.map(value => ({
              value,
              label: labelize(value),
            })),
            value => this._updateProperty('fontStyle', value)
          )}
          ${this._renderSelectRow(
            'Text align',
            model.textAlign,
            TEXT_ALIGN_OPTIONS.map(value => ({
              value,
              label: labelize(value),
            })),
            value => this._updateProperty('textAlign', value)
          )}
          ${this._renderSelectRow(
            'Text horizontal align',
            model.textHorizontalAlign,
            TEXT_ALIGN_OPTIONS.map(value => ({
              value,
              label: labelize(value),
            })),
            value => this._updateProperty('textHorizontalAlign', value)
          )}
          ${this._renderSelectRow(
            'Text vertical align',
            model.textVerticalAlign,
            TEXT_VERTICAL_ALIGN_OPTIONS.map(value => ({
              value,
              label: labelize(value),
            })),
            value => this._updateProperty('textVerticalAlign', value)
          )}
          ${this._renderSelectRow(
            'Text resizing',
            model.textResizing,
            TEXT_RESIZING_OPTIONS,
            value => this._updateProperty('textResizing', Number(value))
          )}
          ${this._renderNumberRow(
            'Text rotate',
            model.textRotate ?? 0,
            value => this._updateProperty('textRotate', value),
            { step: 1 }
          )}
          ${this._renderCheckboxRow(
            'Text flip horizontal',
            model.textFlipX ?? false,
            value => this._updateProperty('textFlipX', value)
          )}
          ${this._renderCheckboxRow(
            'Text flip vertical',
            model.textFlipY ?? false,
            value => this._updateProperty('textFlipY', value)
          )}
          ${this._renderCheckboxRow(
            'Max width enabled',
            model.maxWidth !== false,
            value => this._updateProperty('maxWidth', value ? 240 : false)
          )}
          ${model.maxWidth !== false
            ? this._renderNumberRow(
                'Max width',
                model.maxWidth,
                value => this._updateProperty('maxWidth', value),
                { min: 1, max: 2000, step: 1 }
              )
            : null}
        `
      )}
      ${this._renderSection(
        'Other properties',
        this._renderAutoProperties(model, knownKeys)
      )}
    `;
  }

  private _renderConnectorProperties(model: ConnectorElementModel) {
    const knownKeys = new Set([
      'mode',
      'stroke',
      'strokeWidth',
      'strokeStyle',
      'frontEndpointStyle',
      'rearEndpointStyle',
      'frontEndpointScale',
      'rearEndpointScale',
      'jumpStyle',
      'jumpSize',
      'cornerRadius',
      'rough',
      'roughness',
      'index',
      'lockedBySelf',
      'labelStyle',
      'labelConstraints',
      'labelOffset',
      'labelXYWH',
      'labelDisplay',
      'text',
    ]);

    const labelText = model.text?.toString() ?? '';
    const [cx, cy, cw, ch] = deserializeXYWH(model.xywh);
    const defaultLabelXYWH: [number, number, number, number] = [
      cx + cw / 2 - 40,
      cy + ch / 2 - 12,
      80,
      24,
    ];
    const labelOffset = model.labelOffset ?? {
      distance: 0.5,
      anchor: ConnectorLabelOffsetAnchor.Center,
    };
    const labelConstraints = model.labelConstraints ?? {
      hasMaxWidth: true,
      maxWidth: 280,
    };
    const labelStyle = model.labelStyle ?? {
      color: model.stroke,
      fontFamily: FontFamilyList[0]?.[0],
      fontSize: 16,
      fontWeight: FontWeight.Regular,
      fontStyle: FontStyle.Normal,
      textAlign: TextAlign.Center,
    };
    const labelXYWH = model.labelXYWH ?? defaultLabelXYWH;

    return html`
      ${this._renderSection(
        'Core',
        html`
          ${this._renderSelectRow(
            'Connector type',
            model.mode,
            CONNECTOR_MODE_OPTIONS.map(value => ({
              value,
              label: getConnectorModeName(value),
            })),
            value => this._updateProperty('mode', Number(value))
          )}
          ${this._renderColorRow('Stroke', model.stroke, value =>
            this._updateProperty('stroke', value)
          )}
          ${this._renderSelectRow(
            'Stroke width',
            model.strokeWidth,
            LINE_WIDTH_OPTIONS.map(value => ({
              value,
              label: `${value}`,
            })),
            value => this._updateProperty('strokeWidth', Number(value))
          )}
          ${this._renderSelectRow(
            'Stroke style',
            model.strokeStyle,
            STROKE_STYLE_OPTIONS.map(value => ({
              value,
              label: labelize(value),
            })),
            value => this._updateProperty('strokeStyle', value)
          )}
          ${this._renderMarkerPicker(
            'Start style',
            model.frontEndpointStyle,
            value => this._updateProperty('frontEndpointStyle', value)
          )}
          ${this._renderNumberRow(
            'Start scale (%)',
            model.frontEndpointScale ?? 100,
            value => this._updateProperty('frontEndpointScale', value),
            { min: 1, max: 400, step: 1 }
          )}
          ${this._renderMarkerPicker(
            'End style',
            model.rearEndpointStyle,
            value => this._updateProperty('rearEndpointStyle', value)
          )}
          ${this._renderNumberRow(
            'End scale (%)',
            model.rearEndpointScale ?? 100,
            value => this._updateProperty('rearEndpointScale', value),
            { min: 1, max: 400, step: 1 }
          )}
          ${this._renderSelectRow(
            'Jump type',
            model.jumpStyle ?? 'none',
            [
              { value: 'none', label: 'None' },
              { value: 'arc', label: 'Arc' },
              { value: 'gap', label: 'Gap' },
              { value: 'sharp', label: 'Sharp' },
              { value: 'line', label: 'Line' },
            ],
            value => this._updateProperty('jumpStyle', value)
          )}
          ${this._renderNumberRow(
            'Jump size',
            model.jumpSize ?? 10,
            value => this._updateProperty('jumpSize', value),
            { min: 0, max: 200, step: 1 }
          )}
          ${this._renderNumberRow(
            'Corner radius',
            model.cornerRadius ?? 0,
            value => this._updateProperty('cornerRadius', value),
            { min: 0, max: 200, step: 1 }
          )}
          ${this._renderCheckboxRow('Rough', Boolean(model.rough), value =>
            this._updateProperty('rough', value)
          )}
          ${this._renderNumberRow(
            'Roughness',
            model.roughness ?? 1.4,
            value => this._updateProperty('roughness', value),
            { min: 0, max: 10, step: 0.1 }
          )}
          ${this._renderTextRow('Z index', model.index, value =>
            this._updateProperty('index', value)
          )}
          ${this._renderCheckboxRow('Movable', !model.lockedBySelf, value =>
            this._updateProperty('lockedBySelf', !value)
          )}
        `
      )}
      ${this._renderSection(
        'Label',
        html`
          ${this._renderTextareaRow('Text', labelText, value => {
            if (!value) {
              this._updateProperties({ text: value });
              return;
            }

            this._updateProperties({
              text: value,
              labelDisplay: true,
              labelXYWH: model.labelXYWH ?? defaultLabelXYWH,
            });
          })}
          ${this._renderCheckboxRow(
            'Label display',
            model.labelDisplay ?? true,
            value => this._updateProperty('labelDisplay', value)
          )}
          ${this._renderNumberRow(
            'Label offset',
            labelOffset.distance,
            value =>
              this._updateProperty('labelOffset', {
                ...labelOffset,
                distance: value,
              }),
            { min: 0, max: 1, step: 0.01 }
          )}
          ${this._renderSelectRow(
            'Label anchor',
            labelOffset.anchor ?? ConnectorLabelOffsetAnchor.Center,
            Object.values(ConnectorLabelOffsetAnchor).map(value => ({
              value,
              label: labelize(value),
            })),
            value =>
              this._updateProperty('labelOffset', {
                ...labelOffset,
                anchor: value as ConnectorLabelOffsetAnchor,
              })
          )}
          ${this._renderCheckboxRow(
            'Max width enabled',
            labelConstraints.hasMaxWidth,
            value =>
              this._updateProperty('labelConstraints', {
                ...labelConstraints,
                hasMaxWidth: value,
              })
          )}
          ${this._renderNumberRow(
            'Max width',
            labelConstraints.maxWidth,
            value =>
              this._updateProperty('labelConstraints', {
                ...labelConstraints,
                maxWidth: value,
              }),
            { min: 1, max: 2000, step: 1 }
          )}
          ${this._renderColorRow('Text color', labelStyle.color, value =>
            this._updateProperty('labelStyle', {
              ...labelStyle,
              color: value,
            })
          )}
          ${this._renderSelectRow(
            'Font family',
            labelStyle.fontFamily,
            FontFamilyList.map(([value, label]) => ({ value, label })),
            value =>
              this._updateProperty('labelStyle', {
                ...labelStyle,
                fontFamily: value,
              })
          )}
          ${this._renderNumberRow(
            'Font size',
            labelStyle.fontSize,
            value =>
              this._updateProperty('labelStyle', {
                ...labelStyle,
                fontSize: value,
              }),
            { min: 1, max: 200, step: 1 }
          )}
          ${this._renderSelectRow(
            'Font weight',
            labelStyle.fontWeight,
            FONT_WEIGHT_OPTIONS.map(value => ({
              value,
              label: labelize(value),
            })),
            value =>
              this._updateProperty('labelStyle', {
                ...labelStyle,
                fontWeight: value as FontWeight,
              })
          )}
          ${this._renderSelectRow(
            'Font style',
            labelStyle.fontStyle,
            FONT_STYLE_OPTIONS.map(value => ({
              value,
              label: labelize(value),
            })),
            value =>
              this._updateProperty('labelStyle', {
                ...labelStyle,
                fontStyle: value as FontStyle,
              })
          )}
          ${this._renderSelectRow(
            'Text align',
            labelStyle.textAlign,
            TEXT_ALIGN_OPTIONS.map(value => ({
              value,
              label: labelize(value),
            })),
            value =>
              this._updateProperty('labelStyle', {
                ...labelStyle,
                textAlign: value as TextAlign,
              })
          )}
          ${this._renderNumberRow('Label X', labelXYWH[0], value =>
            this._updateProperty('labelXYWH', [
              value,
              labelXYWH[1],
              labelXYWH[2],
              labelXYWH[3],
            ])
          )}
          ${this._renderNumberRow('Label Y', labelXYWH[1], value =>
            this._updateProperty('labelXYWH', [
              labelXYWH[0],
              value,
              labelXYWH[2],
              labelXYWH[3],
            ])
          )}
          ${this._renderNumberRow('Label W', labelXYWH[2], value =>
            this._updateProperty('labelXYWH', [
              labelXYWH[0],
              labelXYWH[1],
              value,
              labelXYWH[3],
            ])
          )}
          ${this._renderNumberRow('Label H', labelXYWH[3], value =>
            this._updateProperty('labelXYWH', [
              labelXYWH[0],
              labelXYWH[1],
              labelXYWH[2],
              value,
            ])
          )}
        `
      )}
      ${this._renderSection(
        'Other properties',
        this._renderAutoProperties(model, knownKeys)
      )}
    `;
  }

  override connectedCallback() {
    super.connectedCallback();

    const inPeek = Boolean(
      this.parentElement?.closest('[data-peek-view-wrapper]')
    );
    this.toggleAttribute('data-in-peek', inPeek);

    this.tabIndex = -1;
    this.disposables.addFromEvent(this, 'click', (e: Event) => {
      if (e.target === this) {
        this._hide();
      }
    });

    this.disposables.addFromEvent(this, 'keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        this._hide();
      }
    });
  }

  override firstUpdated() {
    this.focus();

    const panel = this.renderRoot.querySelector('.properties-modal-wrapper');
    if (panel) {
      this.disposables.addFromEvent(panel, 'click', stopPropagation);
      this.disposables.addFromEvent(panel, 'pointerdown', stopPropagation);
      this.disposables.addFromEvent(
        panel,
        'wheel',
        (event: WheelEvent) => {
          event.preventDefault();
          event.stopPropagation();
          (panel as HTMLElement).scrollTop += event.deltaY;
        },
        { passive: false }
      );
    }
  }

  override render() {
    if (!this.model) return null;

    const isShape = this.model instanceof ShapeElementModel;
    const isConnector = this.model instanceof ConnectorElementModel;
    const elementType = isShape
      ? 'Shape'
      : isConnector
        ? 'Connector'
        : 'Element';

    return html`
      <div class="properties-modal-wrapper" @click=${stopPropagation}>
        <div class="properties-modal-content">
          <div class="header">
            <span class="title">${elementType} Properties</span>
          </div>

          ${isShape
            ? this._renderShapeProperties(this.model as ShapeElementModel)
            : null}
          ${isConnector
            ? this._renderConnectorProperties(
                this.model as ConnectorElementModel
              )
            : null}
        </div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor model!: GfxModel;

  @property({ attribute: false })
  accessor referenceElement!: ReferenceElement;

  @property({ attribute: false })
  accessor abortController: AbortController | null = null;
}

customElements.define('properties-modal', PropertiesModal);
