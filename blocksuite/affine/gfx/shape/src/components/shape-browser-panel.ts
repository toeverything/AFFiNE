import {
  darkToolbarStyles,
  lightToolbarStyles,
} from '@blocksuite/affine-components/toolbar';
import type { ShapeName, ShapeStyle } from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import {
  requestConnectedFrame,
  stopPropagation,
} from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import type { BlockComponent } from '@blocksuite/std';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, unsafeCSS } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { AllShapeConfig } from '../toolbar/shape-menu-config';

// Shape categories for the browser
export const SHAPE_CATEGORIES = [
  { id: 'general', name: 'General' },
  { id: 'basic', name: 'Basic' },
  { id: 'flowchart', name: 'Flowchart' },
  { id: 'arrows', name: 'Arrows' },
  { id: 'misc', name: 'Misc' },
] as const;

export type ShapeCategory = (typeof SHAPE_CATEGORIES)[number]['id'];

// Map shapes to categories
const SHAPE_CATEGORY_MAP: Record<string, ShapeCategory> = {
  rect: 'general',
  roundedRect: 'general',
  ellipse: 'general',
  diamond: 'general',
  triangle: 'basic',
};

// Triangle arrow pointing down (same as templates panel)
const Triangle = html`<svg
  width="28"
  height="12"
  viewBox="0 0 28 12"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M12.2044 10.6396C12.9884 11.605 14.5223 11.605 15.3063 10.6396L22.0319 2.35951C23.3428 0.745195 22.1983 -1.7649e-06 20.4813 -1.61419e-06L7.02981 -5.13862e-07C5.31236 -3.62991e-07 4.16833 0.745196 5.47883 2.35951L12.2044 10.6396Z"
    fill="currentColor"
  />
</svg>`;

export class EdgelessShapeBrowserPanel extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      position: absolute;
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
      z-index: var(--affine-z-index-popover);
    }

    .shape-browser-panel {
      width: 320px;
      height: 400px;
      border-radius: 12px;
      background-color: var(--affine-background-overlay-panel-color);
      box-shadow: 0px 10px 80px 0px rgba(0, 0, 0, 0.2);
      display: flex;
      flex-direction: column;
    }
    ${unsafeCSS(lightToolbarStyles('.shape-browser-panel'))}
    ${unsafeCSS(darkToolbarStyles('.shape-browser-panel'))}

    .panel-header {
      padding: 16px;
      font-size: 14px;
      font-weight: 600;
      color: var(--affine-text-primary-color);
      border-bottom: 1px solid var(--affine-divider-color);
      flex-shrink: 0;
    }

    .categories {
      display: flex;
      padding: 6px 8px;
      gap: 4px;
      overflow-x: auto;
      flex-shrink: 0;
    }

    .category-entry {
      color: var(--affine-text-primary-color);
      font-size: 12px;
      font-weight: 600;
      line-height: 20px;
      border-radius: 8px;
      flex-shrink: 0;
      flex-grow: 0;
      width: fit-content;
      padding: 4px 9px;
      cursor: pointer;
    }

    .category-entry.selected,
    .category-entry:hover {
      color: var(--affine-text-primary-color);
      background-color: var(--affine-background-tertiary-color);
    }

    .shapes-viewport {
      position: relative;
      flex-grow: 1;
      overflow: hidden;
    }

    .shapes-scrollcontent {
      overflow-y: auto;
      height: 100%;
      width: 100%;
    }

    .shapes-grid {
      padding: 10px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }

    .shape-item {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 12px 8px;
      background-color: var(--affine-background-primary-color);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .shape-item:hover {
      background-color: var(--affine-hover-color);
    }

    .shape-item.active {
      background-color: var(--affine-hover-color);
      outline: 1px solid var(--affine-primary-color);
    }

    .shape-item svg {
      width: 24px;
      height: 24px;
      fill: var(--affine-icon-color);
      stroke: none;
    }

    .shape-name {
      font-size: 10px;
      color: var(--affine-text-secondary-color);
      margin-top: 4px;
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
      color: var(--affine-text-secondary-color);
      font-size: 14px;
    }

    .arrow {
      bottom: 0;
      position: absolute;
      transform: translateY(20px);
      color: var(--affine-background-overlay-panel-color);
    }
  `;

  @state()
  private accessor _selectedCategory: ShapeCategory = 'general';

  @property({ attribute: false })
  accessor edgeless!: BlockComponent;

  @property({ attribute: false })
  accessor selectedShape: ShapeName | null | undefined = undefined;

  @property({ attribute: false })
  accessor shapeStyle: ShapeStyle | undefined = undefined;

  private _closePanel() {
    this.dispatchEvent(new CustomEvent('closepanel'));
  }

  private _onSelect(value: ShapeName) {
    this.selectedShape = value;
    this.dispatchEvent(
      new CustomEvent('shapeselect', {
        detail: { shapeName: value },
      })
    );
  }

  private _selectCategory(category: ShapeCategory) {
    this._selectedCategory = category;
  }

  private _getShapesForCategory(category: ShapeCategory) {
    return AllShapeConfig.filter(
      shape => SHAPE_CATEGORY_MAP[shape.name] === category
    );
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._disposables.addFromEvent(this, 'click', stopPropagation);
    this._disposables.addFromEvent(this, 'wheel', stopPropagation);
  }

  override firstUpdated() {
    requestConnectedFrame(() => {
      this._disposables.addFromEvent(document, 'click', evt => {
        if (this.contains(evt.target as HTMLElement)) {
          return;
        }
        this._closePanel();
      });
    }, this);
  }

  override render() {
    const shapesInCategory = this._getShapesForCategory(this._selectedCategory);
    const appTheme = this.edgeless?.std?.get(ThemeProvider)?.app$?.value;

    return html`
      <div
        class="shape-browser-panel"
        data-app-theme=${appTheme ?? 'light'}
        @keydown=${stopPropagation}
      >
        <div class="panel-header">Shapes</div>
        <div class="categories">
          ${repeat(
            SHAPE_CATEGORIES,
            cat => cat.id,
            cat => html`
              <div
                class="category-entry ${this._selectedCategory === cat.id
                  ? 'selected'
                  : ''}"
                @click=${() => this._selectCategory(cat.id)}
              >
                ${cat.name}
              </div>
            `
          )}
        </div>
        <div class="shapes-viewport">
          <div class="shapes-scrollcontent">
            <div class="shapes-grid">
              ${shapesInCategory.length > 0
                ? repeat(
                    shapesInCategory,
                    item => item.name,
                    ({ name, generalIcon, tooltip }) => html`
                      <div
                        class="shape-item ${this.selectedShape === name
                          ? 'active'
                          : ''}"
                        @click=${() => this._onSelect(name)}
                        title=${tooltip}
                      >
                        ${generalIcon}
                        <span class="shape-name">${tooltip}</span>
                      </div>
                    `
                  )
                : html`<div class="empty-state">
                    No shapes in this category
                  </div>`}
            </div>
          </div>
        </div>
        <div class="arrow">${Triangle}</div>
      </div>
    `;
  }
}
