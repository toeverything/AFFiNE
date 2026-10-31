import {
  filterShapePalettes,
  getShapePaletteDataFrom,
  getShapePalettesStorageKey,
  getToolPaletteMemory,
  readStoredShapePalettes,
  setToolPaletteMemory,
  SHAPE_PALETTES_STORAGE_EVENT,
  shapePaletteKeys,
  shapePalettes,
} from '@blocksuite/affine-gfx-shape';
import { ConnectorMode, type LineWidth } from '@blocksuite/affine-model';
import {
  EditPropsStore,
  FeatureFlagService,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import type { ColorEvent } from '@blocksuite/affine-shared/utils';
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

  private readonly _memoryKey = 'connector';

  private _paletteIndex = 0;

  private _activeColorKey: string | undefined;

  // Tracks which workspace's palettes are currently loaded into `_palettes`.
  // Needed because `this.edgeless.store.workspace.id` isn't reliably
  // available yet at `connectedCallback` time (the edgeless surface/
  // workspace context can still be wiring up) — without this, the menu can
  // render with an uninitialized/empty palette (the "empty pill" symptom)
  // before the workspace becomes available. `_ensureWorkspacePalettesLoaded`
  // (called from render()) uses this to retry the load once it is.
  private _loadedWorkspaceId: string | undefined;

  private _palettes = filterShapePalettes(shapePalettes, 'line');

  private readonly _props$ = computed(() => {
    const { mode, stroke, strokeWidth } =
      this.edgeless.std.get(EditPropsStore).lastProps$.value.connector;
    return { mode, stroke, strokeWidth };
  });

  private readonly _theme$ = computed(() => {
    return this.edgeless.std.get(ThemeProvider).theme$.value;
  });

  override connectedCallback(): void {
    super.connectedCallback();
    const memory = getToolPaletteMemory(this._memoryKey);
    this._reloadPalettes();
    // The workspace id is often not yet available on the same tick as
    // connectedCallback; retry once microtasks (including whatever sets up
    // the workspace context) have flushed, so the palette doesn't stay
    // stuck on the pre-workspace default.
    queueMicrotask(() => this._reloadPalettes());
    this._paletteIndex = memory.index % this._paletteCount;
    this._activeColorKey = memory.activeKey;

    if (typeof window !== 'undefined') {
      window.addEventListener(
        SHAPE_PALETTES_STORAGE_EVENT,
        this._reloadPalettes
      );
      window.addEventListener('storage', this._onStorage);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (typeof window !== 'undefined') {
      window.removeEventListener(
        SHAPE_PALETTES_STORAGE_EVENT,
        this._reloadPalettes
      );
      window.removeEventListener('storage', this._onStorage);
    }
  }

  private readonly _onStorage = (event: StorageEvent) => {
    const workspaceId = this.edgeless?.store?.workspace?.id;
    if (!workspaceId) return;
    if (event.key === getShapePalettesStorageKey(workspaceId)) {
      this._reloadPalettes();
    }
  };

  private readonly _reloadPalettes = () => {
    const workspaceId = this.edgeless?.store?.workspace?.id;
    if (!workspaceId) {
      this._palettes = filterShapePalettes(shapePalettes, 'line');
      this._paletteIndex = this._paletteIndex % this._paletteCount;
      this.requestUpdate();
      return;
    }

    this._loadedWorkspaceId = workspaceId;

    const stored = readStoredShapePalettes(workspaceId);
    this._palettes = filterShapePalettes(stored ?? shapePalettes, 'line');
    this._paletteIndex = this._paletteIndex % this._paletteCount;
    this.requestUpdate();
  };

  private _ensureWorkspacePalettesLoaded() {
    const workspaceId = this.edgeless?.store?.workspace?.id;
    if (workspaceId && workspaceId !== this._loadedWorkspaceId) {
      this._reloadPalettes();
    }
  }

  private readonly _togglePalette = () => {
    this._paletteIndex = (this._paletteIndex + 1) % this._paletteCount;
    this._activeColorKey = undefined;
    setToolPaletteMemory(this._memoryKey, {
      index: this._paletteIndex,
      activeKey: undefined,
    });
    this.requestUpdate();
  };

  private _resolveActiveKey(stroke: unknown) {
    if (typeof stroke !== 'string') return undefined;
    const { strokePalettes } = getShapePaletteDataFrom(
      this._palettes,
      this._paletteIndex % this._paletteCount
    );
    const index = strokePalettes.findIndex(p => p.value === stroke);
    return index >= 0 ? shapePaletteKeys[index] : undefined;
  }

  override type = ConnectorTool;

  override render() {
    this._ensureWorkspacePalettesLoaded();
    const { stroke, strokeWidth, mode } = this._props$.value;
    const { strokePalettes } = getShapePaletteDataFrom(
      this._palettes,
      this._paletteIndex % this._paletteCount
    );
    const activeKey = this._activeColorKey ?? this._resolveActiveKey(stroke);
    const connectorModeButtonGroup = ConnectorModeButtonGroup(
      mode,
      this.onChange
    );

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
              @select=${(e: ColorEvent) => {
                this._activeColorKey = e.detail.key;
                setToolPaletteMemory(this._memoryKey, {
                  index: this._paletteIndex,
                  activeKey: this._activeColorKey,
                });
                this.onChange({ stroke: e.detail.value });
              }}
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
        </div>
      </edgeless-slide-menu>
    `;
  }

  @property({ attribute: false })
  accessor onChange!: (props: Record<string, unknown>) => void;

  get _paletteCount() {
    return Math.max(1, this._palettes.length);
  }
}
