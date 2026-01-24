import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import {
  ConnectorElementModel,
  ShapeElementModel,
} from '@blocksuite/affine-model';
import { fontSMStyle, fontXSStyle } from '@blocksuite/affine-shared/styles';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import {
  listenClickAway,
  stopPropagation,
} from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import type { EditorHost } from '@blocksuite/std';
import type { GfxModel } from '@blocksuite/std/gfx';
import { autoUpdate, computePosition, flip, offset } from '@floating-ui/dom';
import { signal } from '@preact/signals-core';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

export class PropertiesModal extends SignalWatcher(WithDisposable(LitElement)) {
  static override styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;
      z-index: var(--affine-z-index-popover);
      animation: affine-popover-fade-in 0.2s ease;
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
      padding: 12px;
      flex-direction: column;
      justify-content: flex-start;
      align-items: flex-start;
      gap: 8px;
      min-width: 320px;
      max-width: 400px;
      max-height: 600px;
      overflow-y: auto;

      color: var(--affine-icon-color);
      box-shadow: var(--affine-overlay-shadow);
      background: ${unsafeCSSVarV2('layer/background/overlayPanel')};
      border-radius: 8px;
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
    }

    .header {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
    }

    .title {
      font-weight: 600;
      color: var(--affine-text-primary-color);
    }
    ${fontSMStyle('.title')}

    .close-button {
      display: flex;
      padding: 4px;
      cursor: pointer;
      border-radius: 4px;
      background: transparent;
      border: none;
      color: var(--affine-icon-color);
    }

    .close-button:hover {
      background: var(--affine-hover-color);
    }

    .property-row {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

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
    crud.updateElement(this.model.id, { [key]: value });
  };

  private _renderShapeProperties(model: ShapeElementModel) {
    return html`
      <div class="property-row">
        <label class="property-label">Shape Type</label>
        <select
          class="property-select"
          .value=${model.shapeType}
          @change=${(e: Event) => {
            const target = e.target as HTMLSelectElement;
            this._updateProperty('shapeType', target.value);
          }}
        >
          <option value="rect">Rectangle</option>
          <option value="ellipse">Ellipse</option>
          <option value="triangle">Triangle</option>
          <option value="diamond">Diamond</option>
        </select>
      </div>

      <div class="property-row">
        <label class="property-label">Fill Color</label>
        <div class="color-input-wrapper">
          <div
            class="color-preview"
            style="background-color: ${model.fillColor}"
            @click=${(e: Event) => {
              const input = (e.target as HTMLElement)
                .nextElementSibling as HTMLInputElement;
              input?.click();
            }}
          ></div>
          <input
            type="color"
            class="property-input"
            .value=${model.fillColor}
            @input=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              this._updateProperty('fillColor', target.value);
            }}
          />
        </div>
      </div>

      <div class="property-row">
        <label class="property-label">Stroke Color</label>
        <div class="color-input-wrapper">
          <div
            class="color-preview"
            style="background-color: ${model.strokeColor}"
            @click=${(e: Event) => {
              const input = (e.target as HTMLElement)
                .nextElementSibling as HTMLInputElement;
              input?.click();
            }}
          ></div>
          <input
            type="color"
            class="property-input"
            .value=${model.strokeColor}
            @input=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              this._updateProperty('strokeColor', target.value);
            }}
          />
        </div>
      </div>

      <div class="property-row">
        <label class="property-label">Stroke Width</label>
        <input
          type="number"
          class="property-input"
          min="0"
          max="20"
          .value=${model.strokeWidth.toString()}
          @input=${(e: Event) => {
            const target = e.target as HTMLInputElement;
            const value = parseInt(target.value, 10);
            if (!isNaN(value)) {
              this._updateProperty('strokeWidth', value);
            }
          }}
        />
      </div>

      <div class="property-row">
        <label class="property-label">Stroke Style</label>
        <select
          class="property-select"
          .value=${model.strokeStyle}
          @change=${(e: Event) => {
            const target = e.target as HTMLSelectElement;
            this._updateProperty('strokeStyle', target.value);
          }}
        >
          <option value="solid">Solid</option>
          <option value="dash">Dash</option>
          <option value="none">None</option>
        </select>
      </div>

      <div class="property-row">
        <label class="property-label">Filled</label>
        <div class="checkbox-wrapper">
          <input
            type="checkbox"
            .checked=${model.filled}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              this._updateProperty('filled', target.checked);
            }}
          />
          <span class="property-label">Fill shape</span>
        </div>
      </div>

      <div class="property-row">
        <label class="property-label">Corner Radius</label>
        <input
          type="number"
          class="property-input"
          min="0"
          max="1"
          step="0.1"
          .value=${model.radius.toString()}
          @input=${(e: Event) => {
            const target = e.target as HTMLInputElement;
            const value = parseFloat(target.value);
            if (!isNaN(value)) {
              this._updateProperty('radius', value);
            }
          }}
        />
      </div>
    `;
  }

  private _renderConnectorProperties(model: ConnectorElementModel) {
    return html`
      <div class="property-row">
        <label class="property-label">Mode</label>
        <select
          class="property-select"
          .value=${model.mode.toString()}
          @change=${(e: Event) => {
            const target = e.target as HTMLSelectElement;
            this._updateProperty('mode', parseInt(target.value, 10));
          }}
        >
          <option value="0">Straight</option>
          <option value="1">Orthogonal</option>
          <option value="2">Curve</option>
        </select>
      </div>

      <div class="property-row">
        <label class="property-label">Stroke Color</label>
        <div class="color-input-wrapper">
          <div
            class="color-preview"
            style="background-color: ${model.stroke}"
            @click=${(e: Event) => {
              const input = (e.target as HTMLElement)
                .nextElementSibling as HTMLInputElement;
              input?.click();
            }}
          ></div>
          <input
            type="color"
            class="property-input"
            .value=${model.stroke}
            @input=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              this._updateProperty('stroke', target.value);
            }}
          />
        </div>
      </div>

      <div class="property-row">
        <label class="property-label">Stroke Width</label>
        <input
          type="number"
          class="property-input"
          min="0"
          max="20"
          .value=${model.strokeWidth.toString()}
          @input=${(e: Event) => {
            const target = e.target as HTMLInputElement;
            const value = parseInt(target.value, 10);
            if (!isNaN(value)) {
              this._updateProperty('strokeWidth', value);
            }
          }}
        />
      </div>

      <div class="property-row">
        <label class="property-label">Stroke Style</label>
        <select
          class="property-select"
          .value=${model.strokeStyle}
          @change=${(e: Event) => {
            const target = e.target as HTMLSelectElement;
            this._updateProperty('strokeStyle', target.value);
          }}
        >
          <option value="solid">Solid</option>
          <option value="dash">Dash</option>
          <option value="none">None</option>
        </select>
      </div>

      <div class="property-row">
        <label class="property-label">Start Point Style</label>
        <select
          class="property-select"
          .value=${model.frontEndpointStyle}
          @change=${(e: Event) => {
            const target = e.target as HTMLSelectElement;
            this._updateProperty('frontEndpointStyle', target.value);
          }}
        >
          <option value="None">None</option>
          <option value="Arrow">Arrow</option>
          <option value="Triangle">Triangle</option>
          <option value="Circle">Circle</option>
          <option value="Diamond">Diamond</option>
        </select>
      </div>

      <div class="property-row">
        <label class="property-label">End Point Style</label>
        <select
          class="property-select"
          .value=${model.rearEndpointStyle}
          @change=${(e: Event) => {
            const target = e.target as HTMLSelectElement;
            this._updateProperty('rearEndpointStyle', target.value);
          }}
        >
          <option value="None">None</option>
          <option value="Arrow">Arrow</option>
          <option value="Triangle">Triangle</option>
          <option value="Circle">Circle</option>
          <option value="Diamond">Diamond</option>
        </select>
      </div>

      <div class="property-row">
        <label class="property-label">Rough Style</label>
        <div class="checkbox-wrapper">
          <input
            type="checkbox"
            .checked=${model.rough}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              this._updateProperty('rough', target.checked);
            }}
          />
          <span class="property-label">Enable rough style</span>
        </div>
      </div>
    `;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.disposables.addFromEvent(document, 'click', (e: Event) => {
      if (!this.contains(e.target as Node)) {
        this._hide();
      }
    });
  }

  override firstUpdated() {
    if (!this.referenceElement) return;

    this.disposables.add(
      autoUpdate(this.referenceElement, this, () => {
        if (!this.referenceElement) return;
        computePosition(this.referenceElement, this, {
          placement: 'right-start',
          middleware: [flip(), offset(8)],
        })
          .then(({ x, y }) => {
            this.style.left = `${x}px`;
            this.style.top = `${y}px`;
          })
          .catch(console.error);
      })
    );

    this.disposables.addFromEvent(this, 'pointerdown', stopPropagation);
    this.disposables.addFromEvent(this, 'keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        this._hide();
      }
    });
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
        <div class="header">
          <span class="title">${elementType} Properties</span>
          <button class="close-button" @click=${this._hide}>✕</button>
        </div>

        ${isShape
          ? this._renderShapeProperties(this.model as ShapeElementModel)
          : null}
        ${isConnector
          ? this._renderConnectorProperties(this.model as ConnectorElementModel)
          : null}
      </div>
    `;
  }

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor model!: GfxModel;

  @property({ attribute: false })
  accessor referenceElement!: Element;

  @property({ attribute: false })
  accessor abortController: AbortController | null = null;
}

customElements.define('properties-modal', PropertiesModal);
