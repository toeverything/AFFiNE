import { EditPropsStore } from '@blocksuite/affine-shared/services';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import { ArrowUpSmallIcon, GridIcon } from '@blocksuite/icons/lit';
import type { BlockStdScope } from '@blocksuite/std';
import { css, html, LitElement, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';

// Grid size options in pixels
const GRID_SIZE_OPTIONS = [10, 20, 40] as const;

// Default values
const DEFAULT_SHOW_GRID = true;
const DEFAULT_GRID_SIZE = 20;
const DEFAULT_SNAP_TO_GUIDES = true;
const DEFAULT_SNAP_TO_GRID = false;

export class EdgelessGridMenu extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
    }

    .grid-menu-trigger {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 4px 8px;
      border: none;
      background: transparent;
      border-radius: 4px;
      cursor: pointer;
      color: var(--affine-icon-color);
      font-size: 12px;
      font-weight: 500;
    }

    .grid-menu-trigger:hover {
      background: var(--affine-hover-color);
      color: var(--affine-primary-color);
    }

    .grid-menu-trigger.active {
      color: var(--affine-primary-color);
    }

    .grid-menu-trigger svg {
      width: 20px;
      height: 20px;
    }

    .grid-menu-dropdown {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 0;
      background: var(--affine-background-overlay-panel-color);
      border-radius: 8px;
      border: 1px solid var(--affine-border-color);
      box-shadow: var(--affine-shadow-2);
      padding: 8px;
      min-width: 180px;
      z-index: var(--affine-z-index-popover);
    }

    .menu-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .menu-section + .menu-section {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--affine-border-color);
    }

    .menu-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      color: var(--affine-text-primary-color);
    }

    .menu-item:hover {
      background: var(--affine-hover-color);
    }

    .menu-item label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .menu-item input[type='checkbox'] {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    .menu-label {
      font-size: 12px;
      color: var(--affine-text-secondary-color);
      padding: 4px 8px;
      font-weight: 500;
    }

    .grid-size-options {
      display: flex;
      gap: 4px;
      padding: 0 8px;
    }

    .grid-size-option {
      flex: 1;
      padding: 6px 8px;
      border: 1px solid var(--affine-border-color);
      border-radius: 4px;
      background: transparent;
      cursor: pointer;
      font-size: 12px;
      color: var(--affine-text-primary-color);
      text-align: center;
    }

    .grid-size-option:hover {
      background: var(--affine-hover-color);
    }

    .grid-size-option.selected {
      background: var(--affine-primary-color);
      color: var(--affine-white);
      border-color: var(--affine-primary-color);
    }
  `;

  @state()
  private accessor _isOpen = false;

  @state()
  private accessor _showGrid = DEFAULT_SHOW_GRID;

  @state()
  private accessor _gridSize = DEFAULT_GRID_SIZE;

  @state()
  private accessor _snapToGrid = DEFAULT_SNAP_TO_GRID;

  @state()
  private accessor _snapToGuides = DEFAULT_SNAP_TO_GUIDES;

  @property({ attribute: false })
  accessor std!: BlockStdScope;

  private get _editPropsStore() {
    return this.std.get(EditPropsStore);
  }

  private readonly _toggleMenu = (e: Event) => {
    e.stopPropagation();
    this._isOpen = !this._isOpen;
  };

  private readonly _closeMenu = () => {
    this._isOpen = false;
  };

  private readonly _toggleShowGrid = () => {
    this._showGrid = !this._showGrid;
    this._editPropsStore.setStorage('edgelessShowGrid', this._showGrid);
    this.dispatchEvent(
      new CustomEvent('grid-visibility-changed', {
        detail: { visible: this._showGrid },
        bubbles: true,
        composed: true,
      })
    );
  };

  private readonly _setGridSize = (size: number) => {
    this._gridSize = size;
    this._editPropsStore.setStorage('edgelessGridSize', size);
    this.dispatchEvent(
      new CustomEvent('grid-size-changed', {
        detail: { size },
        bubbles: true,
        composed: true,
      })
    );
  };

  private readonly _toggleSnapToGrid = () => {
    this._snapToGrid = !this._snapToGrid;
    console.log('[GridMenu] toggleSnapToGrid:', this._snapToGrid);
    this._editPropsStore.setStorage('edgelessSnapToGrid', this._snapToGrid);
    this.dispatchEvent(
      new CustomEvent('snap-to-grid-changed', {
        detail: { enabled: this._snapToGrid },
        bubbles: true,
        composed: true,
      })
    );
  };

  private readonly _toggleSnapToGuides = () => {
    this._snapToGuides = !this._snapToGuides;
    this._editPropsStore.setStorage('edgelessSnapToGuides', this._snapToGuides);
    this.dispatchEvent(
      new CustomEvent('snap-to-guides-changed', {
        detail: { enabled: this._snapToGuides },
        bubbles: true,
        composed: true,
      })
    );
  };

  private _loadSettings() {
    const store = this._editPropsStore;
    this._showGrid = store.getStorage('edgelessShowGrid') ?? DEFAULT_SHOW_GRID;
    this._gridSize = store.getStorage('edgelessGridSize') ?? DEFAULT_GRID_SIZE;
    this._snapToGuides =
      store.getStorage('edgelessSnapToGuides') ?? DEFAULT_SNAP_TO_GUIDES;
    this._snapToGrid =
      store.getStorage('edgelessSnapToGrid') ?? DEFAULT_SNAP_TO_GRID;
  }

  override connectedCallback() {
    super.connectedCallback();
    this._loadSettings();

    // Close menu when clicking outside
    this._disposables.addFromEvent(document, 'click', (e: Event) => {
      if (!this.contains(e.target as Node)) {
        this._closeMenu();
      }
    });
  }

  override render() {
    return html`
      <div
        style="position: relative;"
        @dblclick=${stopPropagation}
        @mousedown=${stopPropagation}
        @mouseup=${stopPropagation}
        @pointerdown=${stopPropagation}
      >
        <button
          class="grid-menu-trigger ${this._showGrid || this._isOpen
            ? 'active'
            : ''}"
          @click=${this._toggleMenu}
          title="Grid & Snap Settings"
        >
          ${GridIcon({ width: '20px', height: '20px' })}
          ${ArrowUpSmallIcon({ width: '16px', height: '16px' })}
        </button>

        ${this._isOpen
          ? html`
              <div class="grid-menu-dropdown" @click=${stopPropagation}>
                <div class="menu-section">
                  <div class="menu-item" @click=${this._toggleShowGrid}>
                    <label>
                      <input
                        type="checkbox"
                        .checked=${this._showGrid}
                        @change=${this._toggleShowGrid}
                        @click=${stopPropagation}
                      />
                      Show Grid
                    </label>
                  </div>
                </div>

                <div class="menu-section">
                  <div class="menu-label">Grid Size</div>
                  <div class="grid-size-options">
                    ${GRID_SIZE_OPTIONS.map(
                      size => html`
                        <button
                          class="grid-size-option ${this._gridSize === size
                            ? 'selected'
                            : ''}"
                          @click=${() => this._setGridSize(size)}
                        >
                          ${size}px
                        </button>
                      `
                    )}
                  </div>
                </div>

                <div class="menu-section">
                  <div class="menu-label">Snap</div>
                  <div class="menu-item" @click=${this._toggleSnapToGrid}>
                    <label>
                      <input
                        type="checkbox"
                        .checked=${this._snapToGrid}
                        @change=${this._toggleSnapToGrid}
                        @click=${stopPropagation}
                      />
                      Snap to grid
                    </label>
                  </div>
                  <div class="menu-item" @click=${this._toggleSnapToGuides}>
                    <label>
                      <input
                        type="checkbox"
                        .checked=${this._snapToGuides}
                        @change=${this._toggleSnapToGuides}
                        @click=${stopPropagation}
                      />
                      Snap to guides
                    </label>
                  </div>
                </div>
              </div>
            `
          : nothing}
      </div>
    `;
  }
}
