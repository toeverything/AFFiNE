import type { ShapeName, ShapeStyle } from '@blocksuite/affine-model';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { CloseIcon } from '@blocksuite/icons/lit';
import { css, html, LitElement, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { Subject } from 'rxjs';

import {
  AllShapeConfig,
  ExtendedShapeConfig,
} from '../toolbar/shape-menu-config';

// Shape categories for the browser
export const SHAPE_CATEGORIES = [
  { id: 'general', name: 'General' },
  { id: 'basic', name: 'Basic' },
  { id: 'flowchart', name: 'Flowchart' },
  { id: 'arrows', name: 'Arrows' },
  { id: 'misc', name: 'Misc' },
] as const;

export type ShapeCategory = (typeof SHAPE_CATEGORIES)[number]['id'];

// Map shapes to categories (for now, all shapes are in General)
// This can be expanded as more shapes are added
const SHAPE_CATEGORY_MAP: Record<string, ShapeCategory> = {
  rect: 'general',
  roundedRect: 'general',
  ellipse: 'general',
  diamond: 'general',
  triangle: 'basic',
};

export class EdgelessShapeBrowserPanel extends SignalWatcher(
  WithDisposable(LitElement)
) {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      background: var(--affine-background-overlay-panel-color);
      border-radius: 8px;
      border: 1px solid var(--affine-border-color);
      box-shadow: var(--affine-shadow-2);
      width: 320px;
      max-height: 400px;
      overflow: hidden;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--affine-border-color);
    }

    .header-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--affine-text-primary-color);
    }

    .close-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      cursor: pointer;
      color: var(--affine-icon-color);
    }

    .close-button:hover {
      background: var(--affine-hover-color);
    }

    .categories {
      display: flex;
      gap: 4px;
      padding: 8px 16px;
      overflow-x: auto;
      border-bottom: 1px solid var(--affine-border-color);
    }

    .category-chip {
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
      background: var(--affine-background-secondary-color);
      color: var(--affine-text-secondary-color);
      border: 1px solid transparent;
      transition: all 0.2s ease;
    }

    .category-chip:hover {
      background: var(--affine-hover-color);
    }

    .category-chip.selected {
      background: var(--affine-primary-color);
      color: var(--affine-white);
    }

    .shapes-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      padding: 16px;
      overflow-y: auto;
    }

    .shape-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 12px 8px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .shape-item:hover {
      background: var(--affine-hover-color);
    }

    .shape-item.active {
      background: var(--affine-hover-color);
      border: 1px solid var(--affine-primary-color);
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
  `;

  slots = {
    select: new Subject<ShapeName>(),
    close: new Subject<void>(),
  };

  @state()
  private accessor _selectedCategory: ShapeCategory = 'general';

  @property({ attribute: false })
  accessor selectedShape: ShapeName | null | undefined = undefined;

  @property({ attribute: false })
  accessor shapeStyle: ShapeStyle | undefined = undefined;

  private _onSelect(value: ShapeName) {
    this.selectedShape = value;
    this.slots.select.next(value);
  }

  private _onClose() {
    this.slots.close.next();
  }

  private _selectCategory(category: ShapeCategory) {
    this._selectedCategory = category;
  }

  private _getShapesForCategory(category: ShapeCategory) {
    return AllShapeConfig.filter(
      shape => SHAPE_CATEGORY_MAP[shape.name] === category
    );
  }

  override disconnectedCallback(): void {
    this.slots.select.complete();
    this.slots.close.complete();
    super.disconnectedCallback();
  }

  override render() {
    const shapesInCategory = this._getShapesForCategory(this._selectedCategory);

    return html`
      <div class="header">
        <span class="header-title">Shape Browser</span>
        <div class="close-button" @click=${this._onClose}>${CloseIcon()}</div>
      </div>

      <div class="categories">
        ${repeat(
          SHAPE_CATEGORIES,
          cat => cat.id,
          cat => html`
            <div
              class="category-chip ${this._selectedCategory === cat.id
                ? 'selected'
                : ''}"
              @click=${() => this._selectCategory(cat.id)}
            >
              ${cat.name}
            </div>
          `
        )}
      </div>

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
          : html`<div class="empty-state">No shapes in this category</div>`}
      </div>
    `;
  }
}
