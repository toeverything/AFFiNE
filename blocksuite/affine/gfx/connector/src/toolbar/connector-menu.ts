import {
  ConnectorMode,
  DefaultTheme,
  type JumpStyle,
  type LineWidth,
} from '@blocksuite/affine-model';
import {
  EditPropsStore,
  FeatureFlagService,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import type { ColorEvent } from '@blocksuite/affine-shared/utils';
import { EdgelessToolbarToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { SignalWatcher } from '@blocksuite/global/lit';
import {
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
  `;

  private readonly _props$ = computed(() => {
    const {
      mode,
      stroke,
      strokeWidth,
      jumpStyle = 'none',
    } = this.edgeless.std.get(EditPropsStore).lastProps$.value.connector;
    return { mode, stroke, strokeWidth, jumpStyle };
  });

  private readonly _theme$ = computed(() => {
    return this.edgeless.std.get(ThemeProvider).theme$.value;
  });

  override type = ConnectorTool;

  override render() {
    const { stroke, strokeWidth, mode, jumpStyle } = this._props$.value;
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
          <edgeless-color-panel
            class="one-way"
            .value=${stroke}
            .theme=${this._theme$.value}
            .palettes=${DefaultTheme.StrokeColorShortPalettes}
            .hasTransparent=${!this.edgeless.store
              .get(FeatureFlagService)
              .getFlag('enable_color_picker')}
            @select=${(e: ColorEvent) =>
              this.onChange({ stroke: e.detail.value })}
          ></edgeless-color-panel>
          <div class="submenu-divider"></div>
          ${jumpStyleSelector}
        </div>
      </edgeless-slide-menu>
    `;
  }

  @property({ attribute: false })
  accessor onChange!: (props: Record<string, unknown>) => void;
}
