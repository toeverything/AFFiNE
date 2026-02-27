import {
  getShapePaletteData,
  getToolPaletteMemory,
  setToolPaletteMemory,
  shapePaletteKeys,
  shapePalettes,
} from '@blocksuite/affine-gfx-shape';
import {
  type Color,
  ConnectorMode,
  type JumpStyle,
  LineWidth,
} from '@blocksuite/affine-model';
import {
  EditPropsStore,
  FeatureFlagService,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import { type ColorEvent } from '@blocksuite/affine-shared/utils';
import { EdgelessToolbarToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { SignalWatcher } from '@blocksuite/global/lit';
import {
  ArrowUpSmallIcon,
  ConnectorCIcon,
  ConnectorEIcon,
  ConnectorLIcon,
} from '@blocksuite/icons/lit';
import { computed } from '@preact/signals-core';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

import { ConnectorTool } from '../connector-tool';
import { ConnectorRIcon } from './icons';

function ConnectorModeButtonGroup(
  mode: ConnectorMode,
  setConnectorMode: (props: Record<string, unknown>) => void
) {
  /**
   * There is little hacky on rendering tooltip.
   * We don't want either tooltip overlap the top button or tooltip on left.
   * So we put the lower button's tooltip as the first element of the button group container
   */
  return html`
    <div class="connector-mode-button-group">
      <edgeless-tool-icon-button
        .active=${mode === ConnectorMode.Curve}
        .activeMode=${'background'}
        .tooltip=${'Curve'}
        .iconSize=${'20px'}
        @click=${() => setConnectorMode({ mode: ConnectorMode.Curve })}
      >
        ${ConnectorCIcon()}
      </edgeless-tool-icon-button>
      <edgeless-tool-icon-button
        .active=${mode === ConnectorMode.Orthogonal}
        .activeMode=${'background'}
        .tooltip=${'Elbowed'}
        .iconSize=${'20px'}
        @click=${() => setConnectorMode({ mode: ConnectorMode.Orthogonal })}
      >
        ${ConnectorEIcon()}
      </edgeless-tool-icon-button>
      <edgeless-tool-icon-button
        .active=${mode === ConnectorMode.Rounded}
        .activeMode=${'background'}
        .tooltip=${'Rounded'}
        .iconSize=${'20px'}
        @click=${() => setConnectorMode({ mode: ConnectorMode.Rounded })}
      >
        ${ConnectorRIcon()}
      </edgeless-tool-icon-button>
      <edgeless-tool-icon-button
        .active=${mode === ConnectorMode.Straight}
        .activeMode=${'background'}
        .tooltip=${'Straight'}
        .iconSize=${'20px'}
        @click=${() => setConnectorMode({ mode: ConnectorMode.Straight })}
      >
        ${ConnectorLIcon()}
      </edgeless-tool-icon-button>
    </div>
  `;
}

function JumpStyleSelector(
  jumpStyle: JumpStyle,
  onChange: (props: Record<string, unknown>) => void
) {
  return html`
    <div class="jump-style-selector">
      <label class="jump-style-label">Jump:</label>
      <select
        class="jump-style-select"
        .value=${jumpStyle}
        @change=${(e: Event) =>
          onChange({ jumpStyle: (e.target as HTMLSelectElement).value })}
      >
        <option value="none">None</option>
        <option value="arc">Arc</option>
        <option value="gap">Gap</option>
        <option value="sharp">Sharp</option>
        <option value="line">Line</option>
      </select>
    </div>
  `;
}

export class EdgelessConnectorMenu extends EdgelessToolbarToolMixin(
  SignalWatcher(LitElement)
) {
  private readonly _memoryKey = 'connector';

  private _paletteIndex = 0;

  private _activeColorKey: string | undefined;

  static override styles = css`
    :host {
      position: absolute;
      display: flex;
      z-index: -1;
    }

    .connector-submenu-content {
      display: flex;
      height: 24px;
      align-items: center;
      justify-content: center;
    }

    .connector-mode-button-group {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 14px;
    }

    .connector-mode-button-group > edgeless-tool-icon-button svg {
      fill: var(--affine-icon-color);
    }

    .submenu-divider {
      width: 1px;
      height: 24px;
      margin: 0 16px;
      background-color: var(--affine-border-color);
      display: inline-block;
    }

    .jump-style-selector {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .jump-style-label {
      font-size: 12px;
      color: var(--affine-text-secondary-color);
    }

    .jump-style-select {
      padding: 4px 8px;
      border: 1px solid var(--affine-border-color);
      border-radius: 4px;
      background: var(--affine-background-primary-color);
      color: var(--affine-text-primary-color);
      font-size: 12px;
      cursor: pointer;
    }

    .color-panel-container {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .palette-toggle-button {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
    }

    .palette-toggle-button svg {
      fill: none;
      stroke: var(--affine-icon-color);
    }
  `;

  private readonly _props$ = computed(() => {
    const connectorProps =
      this.edgeless.std.get(EditPropsStore).lastProps$.value.connector;
    const { mode, stroke, strokeWidth } = connectorProps;
    // jumpStyle may not exist in lastProps if not yet added to the store
    const jumpStyle: JumpStyle =
      'jumpStyle' in connectorProps
        ? (connectorProps.jumpStyle as JumpStyle)
        : 'none';
    return { mode, stroke, strokeWidth, jumpStyle };
  });

  private readonly _theme$ = computed(() => {
    return this.edgeless.std.get(ThemeProvider).theme$.value;
  });

  override connectedCallback(): void {
    super.connectedCallback();
    const memory = getToolPaletteMemory(this._memoryKey);
    this._paletteIndex = memory.index;
    this._activeColorKey = memory.activeKey;
  }

  private readonly _togglePalette = () => {
    this._paletteIndex = (this._paletteIndex + 1) % shapePalettes.length;
    this._activeColorKey = undefined;
    setToolPaletteMemory(this._memoryKey, {
      index: this._paletteIndex,
      activeKey: undefined,
    });
    this.requestUpdate();
  };

  private _resolveActiveKey(stroke: Color) {
    if (typeof stroke !== 'string') return undefined;
    const { strokePalettes } = getShapePaletteData(this._paletteIndex);
    const index = strokePalettes.findIndex(p => p.value === stroke);
    return index >= 0 ? shapePaletteKeys[index] : undefined;
  }

  private readonly _onPickColor = (e: ColorEvent) => {
    this._activeColorKey = e.detail.key;
    setToolPaletteMemory(this._memoryKey, {
      index: this._paletteIndex,
      activeKey: this._activeColorKey,
    });
    this.onChange({ stroke: e.detail.value as string });
  };

  override type = ConnectorTool;

  override render() {
    const { stroke, strokeWidth, mode, jumpStyle } = this._props$.value;
    const { strokePalettes } = getShapePaletteData(this._paletteIndex);
    const activeKey = this._activeColorKey ?? this._resolveActiveKey(stroke);
    const connectorModeButtonGroup = ConnectorModeButtonGroup(
      mode,
      this.onChange
    );
    const jumpStyleSelector = JumpStyleSelector(jumpStyle, this.onChange);

    return html`
      <edgeless-slide-menu>
        <div class="connector-submenu-content">
          ${connectorModeButtonGroup}
          <div class="submenu-divider"></div>
          <edgeless-line-width-panel
            .selectedSize=${strokeWidth}
            @select=${(e: CustomEvent<LineWidth>) =>
              this.onChange({ strokeWidth: e.detail })}
          >
          </edgeless-line-width-panel>
          <div class="submenu-divider"></div>
          <div class="color-panel-container">
            <edgeless-color-panel
              class="one-way"
              .value=${stroke}
              .theme=${this._theme$.value}
              .palettes=${strokePalettes}
              .activeKey=${activeKey}
              .hasTransparent=${!this.edgeless.store
                .get(FeatureFlagService)
                .getFlag('enable_color_picker')}
              @select=${this._onPickColor}
            ></edgeless-color-panel>
            <edgeless-tool-icon-button
              class="palette-toggle-button"
              .tooltip=${'Next palette'}
              .activeMode=${'background'}
              .iconSize=${'20px'}
              @click=${this._togglePalette}
            >
              ${ArrowUpSmallIcon()}
            </edgeless-tool-icon-button>
          </div>
          <div class="submenu-divider"></div>
          ${jumpStyleSelector}
        </div>
      </edgeless-slide-menu>
    `;
  }

  @property({ attribute: false })
  accessor onChange!: (props: Record<string, unknown>) => void;
}
