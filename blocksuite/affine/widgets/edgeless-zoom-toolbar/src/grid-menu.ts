import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ArrowDownSmallIcon, GridIcon } from '@blocksuite/icons/lit';
import type { BlockStdScope } from '@blocksuite/std';
import { signal } from '@preact/signals-core';
import { css, html, LitElement, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';

// Grid size options in pixels
const GRID_SIZE_OPTIONS = [10, 20, 40] as const;

export class EdgelessGridMenu extends SignalWatcher(
  WithDisposable(LitElement)
) {
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
      bottom: 100%;
      left: 0;
      margin-bottom: 8px;
      background: var(--affine-background-overlay-panel-color);
      border-radius: 8px;
      border: 1px solid var(--affine-border-color);
      box-shadow: var(--affine-shadow-2);
      padding: 8px;
      min-width: 180px;
      z-index: 10;
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

  // Grid settings signals
  private readonly _showGrid$ = signal(false);
  private readonly _gridSize$ = signal(20);
  private readonly _snapToGrid$ = signal(true);
  private readonly _snapToGuides$ = signal(true);

  @state()
  private accessor _isOpen = false;

  @property({ attribute: false })
  accessor std!: BlockStdScope;

  private _toggleMenu() {
    this._isOpen = !this._isOpen;
  }

  private _closeMenu() {
    this._isOpen = false;
  }

  private _toggleShowGrid() {
    this._showGrid$.value = !this._showGrid$.value;
    // TODO: Implement actual grid rendering
  }

  private _setGridSize(size: number) {
    this._gridSize$.value = size;
    // TODO: Implement actual grid size change
  }

  private _toggleSnapToGrid() {
    this._snapToGrid$.value = !this._snapToGrid$.value;
    // TODO: Wire up to snap manager
  }

  private _toggleSnapToGuides() {
    this._snapToGuides$.value = !this._snapToGuides$.value;
    // TODO: Wire up to snap manager
  }

  override connectedCallback() {
    super.connectedCallback();
    // Close menu when clicking outside
    this._disposables.addFromEvent(document, 'click', (e: Event) => {
      if (!this.contains(e.target as Node)) {
        this._closeMenu();
      }
    });
  }

  override render() {
    const showGrid = this._showGrid$.value;
    const gridSize = this._gridSize$.value;
    const snapToGrid = this._snapToGrid$.value;
    const snapToGuides = this._snapToGuides$.value;

    return html`
      <div
        @dblclick=${stopPropagation}
        @mousedown=${stopPropagation}
        @mouseup=${stopPropagation}
        @pointerdown=${stopPropagation}
      >
        <button
          class="grid-menu-trigger ${showGrid ? 'active' : ''}"
          @click=${this._toggleMenu}
          title="Grid & Snap Settings"
        >
          ${GridIcon({ width: '20px', height: '20px' })}
          ${ArrowDownSmallIcon({ width: '16px', height: '16px' })}
        </button>

        ${this._isOpen
          ? html`
              <div class="grid-menu-dropdown" @click=${stopPropagation}>
                <div class="menu-section">
                  <div class="menu-item" @click=${this._toggleShowGrid}>
                    <label>
                      <input
                        type="checkbox"
                        .checked=${showGrid}
                        @change=${this._toggleShowGrid}
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
                          class="grid-size-option ${gridSize === size
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
                        .checked=${snapToGrid}
                        @change=${this._toggleSnapToGrid}
                      />
                      Snap to grid
                    </label>
                  </div>
                  <div class="menu-item" @click=${this._toggleSnapToGuides}>
                    <label>
                      <input
                        type="checkbox"
                        .checked=${snapToGuides}
                        @change=${this._toggleSnapToGuides}
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
