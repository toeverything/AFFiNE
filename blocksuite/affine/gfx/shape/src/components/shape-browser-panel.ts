import {
  darkToolbarStyles,
  lightToolbarStyles,
} from '@blocksuite/affine-components/toolbar';
import { type ShapeName, type ShapeStyle } from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import {
  requestConnectedFrame,
  stopPropagation,
} from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import type { BlockComponent } from '@blocksuite/std';
import { css, html, LitElement, unsafeCSS } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { AllShapeConfig } from '../toolbar/shape-menu-config';

export type ShapeCategory = string;

const BASE_CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  basic: 'Basic',
  flowchart: 'Flowchart',
  arrows: 'Arrows',
  misc: 'Misc',
};

const BASE_CATEGORY_ORDER = ['general', 'flowchart', 'arrows', 'basic', 'misc'];

// Map shapes to categories
const SHAPE_CATEGORY_MAP: Record<string, ShapeCategory> = {
  rect: 'general',
  roundedRect: 'general',
  ellipse: 'general',
  cylinder: 'general',
  diamond: 'general',
  triangle: 'general',
  triangleRight: 'general',
  hexagon: 'general',
  parallelogram: 'general',
  trapezoid: 'general',
  step: 'general',
  cloud: 'general',
  document: 'general',
  note: 'general',
  cube: 'general',
  callout: 'general',
  actor: 'general',
  dataStorage: 'general',
  tape: 'general',
  internalStorage: 'general',
  logicAnd: 'general',
  logicOr: 'general',
  flowchartProcess: 'flowchart',
  flowchartDecision: 'flowchart',
  flowchartData: 'flowchart',
  flowchartDocument: 'flowchart',
  flowchartManualInput: 'flowchart',
  flowchartDelay: 'flowchart',
  flowchartPredefinedProcess: 'flowchart',
  flowchartStoredData: 'flowchart',
  flowchartInternalStorage: 'flowchart',
  flowchartDatabase: 'flowchart',
  flowchartSequentialData: 'flowchart',
  flowchartTerminator: 'flowchart',
  flowchartPreparation: 'flowchart',
  flowchartMerge: 'flowchart',
  flowchartPaperTape: 'flowchart',
  flowchartAnnotation1: 'flowchart',
  flowchartAnnotation2: 'flowchart',
  flowchartCard: 'flowchart',
  flowchartCollate: 'flowchart',
  flowchartDirectData: 'flowchart',
  flowchartDisplay: 'flowchart',
  flowchartLoopLimit: 'flowchart',
  flowchartManualOperation: 'flowchart',
  flowchartMultiDocument: 'flowchart',
  flowchartOffPageReference: 'flowchart',
  flowchartOr: 'flowchart',
  flowchartSort: 'flowchart',
  flowchartSummingFunction: 'flowchart',
  arrowUp: 'arrows',
  arrowDown: 'arrows',
  arrowLeft: 'arrows',
  arrowRight: 'arrows',
  arrowTwoWayHorizontal: 'arrows',
  arrowTwoWayVertical: 'arrows',
  arrowBentLeft: 'arrows',
  arrowBentRight: 'arrows',
  arrowBentUp: 'arrows',
  arrowNotchedSignalIn: 'arrows',
  arrowNotchedRight: 'arrows',
  arrowNotchedStylised: 'arrows',
  arrowCalloutUp: 'arrows',
  arrowCalloutDouble: 'arrows',
  arrowCalloutQuad: 'arrows',
};

type ShapeBrowserItem = {
  id: string;
  name: ShapeName;
  tooltip: string;
  category: ShapeCategory;
  categoryLabel?: string;
  generalIcon?: (typeof AllShapeConfig)[number]['generalIcon'];
  scribbledIcon?: (typeof AllShapeConfig)[number]['scribbledIcon'];
  disabled?: boolean;
};

const SHAPE_CONFIG_BY_NAME = AllShapeConfig.reduce(
  (acc, item) => {
    acc[item.name] = item;
    return acc;
  },
  {} as Record<
    (typeof AllShapeConfig)[number]['name'],
    (typeof AllShapeConfig)[number]
  >
);

const SHAPE_BROWSER_ITEMS: ShapeBrowserItem[] = [
  {
    id: 'rectangle',
    category: 'general',
    categoryLabel: BASE_CATEGORY_LABELS.general,
    ...SHAPE_CONFIG_BY_NAME.rect,
    tooltip: 'Rectangle',
  },
  {
    id: 'roundedRect',
    category: 'general',
    categoryLabel: BASE_CATEGORY_LABELS.general,
    ...SHAPE_CONFIG_BY_NAME.roundedRect,
  },
  {
    id: 'square',
    category: 'general',
    categoryLabel: BASE_CATEGORY_LABELS.general,
    ...SHAPE_CONFIG_BY_NAME.rect,
    tooltip: 'Square',
  },
  {
    id: 'ellipse',
    category: 'general',
    categoryLabel: BASE_CATEGORY_LABELS.general,
    ...SHAPE_CONFIG_BY_NAME.ellipse,
    tooltip: 'Ellipse',
  },
  {
    id: 'circle',
    category: 'general',
    categoryLabel: BASE_CATEGORY_LABELS.general,
    ...SHAPE_CONFIG_BY_NAME.ellipse,
    tooltip: 'Circle',
  },
  {
    id: 'cylinder',
    category: 'general',
    categoryLabel: BASE_CATEGORY_LABELS.general,
    ...SHAPE_CONFIG_BY_NAME.cylinder,
    tooltip: 'Cylinder',
  },
  ...AllShapeConfig.filter(
    item => !['rect', 'roundedRect', 'ellipse', 'cylinder'].includes(item.name)
  ).map(item => ({
    ...item,
    id: item.name,
    category: SHAPE_CATEGORY_MAP[item.name],
    categoryLabel: BASE_CATEGORY_LABELS[SHAPE_CATEGORY_MAP[item.name]],
  })),
];

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

const SHAPE_CARD_WIDTH = 100;
const SHAPE_CARD_GAP_X = 20;
const SHAPE_CARD_GAP_Y = 10;
const SHAPE_LIST_PADDING = 10;

function getPreferredRows(viewportWidth: number) {
  if (viewportWidth >= 2200) return 1;
  if (viewportWidth >= 1700) return 2;
  if (viewportWidth >= 1300) return 3;
  return 4;
}

function getShapeBrowserLayout(viewportWidth: number, itemCount: number) {
  const maxPanelWidth = Math.max(280, Math.min(1100, viewportWidth - 64));
  const maxColumnsFit = Math.max(
    1,
    Math.floor(
      (maxPanelWidth - SHAPE_LIST_PADDING * 2 + SHAPE_CARD_GAP_X) /
        (SHAPE_CARD_WIDTH + SHAPE_CARD_GAP_X)
    )
  );
  const preferredRows = getPreferredRows(viewportWidth);
  const wantedColumns = Math.max(1, Math.ceil(itemCount / preferredRows));
  const columns = Math.max(1, Math.min(wantedColumns, maxColumnsFit, 4));
  const panelWidth =
    SHAPE_LIST_PADDING * 2 +
    columns * SHAPE_CARD_WIDTH +
    (columns - 1) * SHAPE_CARD_GAP_X;

  return { columns, panelWidth };
}

export class EdgelessShapeBrowserPanel extends WithDisposable(LitElement) {
  // Matching template-panel.ts styling exactly
  static override styles = css`
    :host {
      position: absolute;
      font-family: var(--affine-font-family);
      z-index: 2147483647;
      isolation: isolate;
      pointer-events: auto;
    }

    .edgeless-shapes-panel {
      width: var(--shape-browser-panel-width, 467px);
      height: 400px;
      position: relative;
      z-index: 1;
      border-radius: 12px;
      background-color: var(--affine-background-overlay-panel-color);
      box-shadow: 0px 10px 80px 0px rgba(0, 0, 0, 0.2);

      display: flex;
      flex-direction: column;
      pointer-events: auto;
    }
    ${unsafeCSS(lightToolbarStyles('.edgeless-shapes-panel'))}
    ${unsafeCSS(darkToolbarStyles('.edgeless-shapes-panel'))}

    .search-bar {
      padding: 21px 24px;
      font-size: 18px;
      color: var(--affine-secondary);
      border-bottom: 1px solid var(--affine-divider-color);

      flex-shrink: 0;
      position: relative;
    }

    .search-bar.capture-mode::after {
      content: '';
      position: absolute;
      width: 1px;
      height: 20px;
      left: 26px;
      top: 24px;
      background: var(--affine-text-primary-color);
      animation: search-caret-blink 1s steps(1, end) infinite;
      pointer-events: none;
    }

    @keyframes search-caret-blink {
      0%,
      49% {
        opacity: 1;
      }
      50%,
      100% {
        opacity: 0;
      }
    }

    .search-input {
      border: 0;
      color: var(--affine-text-primary-color);
      font-size: 20px;
      background-color: inherit;
      outline: none;
      width: 100%;
    }

    .search-input::placeholder {
      color: var(--affine-text-secondary-color);
    }

    .shape-categories {
      display: flex;
      padding: 6px 8px;
      gap: 4px;
      overflow-x: scroll;

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
      overscroll-behavior: contain;
    }

    .shapes-scrollcontent {
      overflow: auto;
      height: 100%;
      width: 100%;
      overscroll-behavior: contain;
      scrollbar-width: auto;
    }

    .shapes-scrollcontent::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    overlay-scrollbar {
      display: none;
    }

    .shapes-list {
      padding: ${SHAPE_LIST_PADDING}px;
      display: grid;
      grid-template-columns: repeat(
        var(--shape-browser-columns, 4),
        ${SHAPE_CARD_WIDTH}px
      );
      justify-content: center;
      align-content: flex-start;
      gap: ${SHAPE_CARD_GAP_Y}px ${SHAPE_CARD_GAP_X}px;
    }

    .shape-item {
      position: relative;
      width: 100px;
      height: 70px;
      box-shadow: 0px 4px 4px 0px rgba(0, 0, 0, 0.02);
      background-color: var(--affine-background-primary-color);
      border-radius: 4px;
      cursor: pointer;
      color: var(--affine-icon-color);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .shape-item svg {
      width: 32px;
      height: 32px;
      fill: none;
      stroke: var(--affine-icon-color);
      position: relative;
      z-index: 1;
    }

    .shape-item:hover::after {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      border: 1px solid var(--affine-black-10);
      border-radius: 4px;
      background-color: var(--affine-hover-color);
    }

    .shape-item.active {
      outline: 2px solid var(--affine-primary-color);
    }

    .shape-name {
      font-size: 10px;
      color: var(--affine-text-secondary-color);
      margin-top: 4px;
      text-align: center;
      position: relative;
      z-index: 1;
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
      color: var(--affine-text-secondary-color);
      font-size: 14px;
      width: 100%;
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

  @state()
  private accessor _searchKeyword = '';

  @state()
  private accessor _captureSearchKeys = false;

  @state()
  private accessor _viewportWidth =
    typeof window === 'undefined' ? 1440 : window.innerWidth;

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

  private _updateSearchKeyword(e: InputEvent) {
    this._searchKeyword = (e.target as HTMLInputElement).value;
  }

  private _stopNonEscapeKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') return;
    stopPropagation(event);
  }

  private _focusSearchInput() {
    const input = this.renderRoot.querySelector(
      '.search-input'
    ) as HTMLInputElement | null;
    input?.focus();
  }

  private _forceFocusSearchInput() {
    const focusNow = () => {
      const input = this.renderRoot.querySelector(
        '.search-input'
      ) as HTMLInputElement | null;
      if (!input) return;
      input.focus();
    };

    focusNow();
    queueMicrotask(focusNow);
    requestAnimationFrame(focusNow);
    setTimeout(focusNow, 0);
  }

  private _getFilteredItems(includeSearchableLibraries = true) {
    void includeSearchableLibraries;
    return SHAPE_BROWSER_ITEMS;
  }
  private _getShapesForCategory(category: ShapeCategory) {
    let shapes = this._getFilteredItems().filter(
      shape => shape.category === category
    );

    // Filter by search keyword if present
    if (this._searchKeyword) {
      const keyword = this._searchKeyword.toLowerCase();
      shapes = shapes.filter(
        shape =>
          String(shape.name).toLowerCase().includes(keyword) ||
          (shape.tooltip ?? '').toLowerCase().includes(keyword)
      );
    }

    return shapes;
  }

  private _getAvailableCategories(): Array<{
    id: ShapeCategory;
    name: string;
  }> {
    const shapes = this._searchKeyword
      ? this._getFilteredItems().filter(shape => {
          const keyword = this._searchKeyword.toLowerCase();
          return (
            String(shape.name).toLowerCase().includes(keyword) ||
            (shape.tooltip ?? '').toLowerCase().includes(keyword)
          );
        })
      : this._getFilteredItems();
    const categoryMap = new Map<string, string>();
    shapes.forEach(shape => {
      if (!categoryMap.has(shape.category)) {
        categoryMap.set(
          shape.category,
          shape.categoryLabel ??
            BASE_CATEGORY_LABELS[shape.category] ??
            shape.category
        );
      }
    });

    const base = BASE_CATEGORY_ORDER.filter(id => categoryMap.has(id)).map(
      id => ({
        id,
        name: categoryMap.get(id) ?? id,
      })
    );
    const extras = [...categoryMap.entries()]
      .filter(([id]) => !BASE_CATEGORY_ORDER.includes(id))
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ id, name }));

    return [...base, ...extras];
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', this._stopNonEscapeKeydown, true);
    this.addEventListener('keydown', this._stopNonEscapeKeydown, false);
    this._disposables.addFromEvent(this, 'click', stopPropagation);
    this._disposables.addFromEvent(this, 'pointerdown', stopPropagation);
    this._disposables.addFromEvent(window, 'resize', () => {
      this._viewportWidth = window.innerWidth;
    });
    this._disposables.addFromEvent(
      window,
      'keydown',
      (event: KeyboardEvent) => {
        if (!this._captureSearchKeys) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        const input = this.renderRoot.querySelector(
          '.search-input'
        ) as HTMLInputElement | null;
        if (!input) return;

        if (event.key === 'Backspace') {
          event.preventDefault();
          event.stopPropagation();
          this._searchKeyword = this._searchKeyword.slice(0, -1);
          input.value = this._searchKeyword;
          return;
        }

        if (
          event.key === 'Escape' ||
          event.key === 'Enter' ||
          event.key === 'Tab'
        ) {
          return;
        }

        if (event.key.length === 1) {
          event.preventDefault();
          event.stopPropagation();
          this._searchKeyword = `${this._searchKeyword}${event.key}`;
          input.value = this._searchKeyword;
        }
      },
      true
    );
  }

  override firstUpdated() {
    this._focusSearchInput();

    const scrollContent = this.renderRoot.querySelector(
      '.shapes-scrollcontent'
    );
    if (scrollContent) {
      this._disposables.addFromEvent(
        scrollContent,
        'wheel',
        (event: WheelEvent) => {
          event.preventDefault();
          event.stopPropagation();
          const element = scrollContent as HTMLElement;
          element.scrollTop += event.deltaY;
        },
        { passive: false }
      );
    }

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
    const availableCategories = this._getAvailableCategories();
    const selectedCategory = availableCategories.find(
      cat => cat.id === this._selectedCategory
    )?.id;
    const effectiveCategory =
      selectedCategory ?? availableCategories[0]?.id ?? 'general';
    const shapesInCategory = this._getShapesForCategory(effectiveCategory);
    const baseItems = this._getFilteredItems(false);
    const baseCategoryCounts = new Map<string, number>();
    baseItems.forEach(shape => {
      baseCategoryCounts.set(
        shape.category,
        (baseCategoryCounts.get(shape.category) ?? 0) + 1
      );
    });
    const maxBaseCategoryItemCount = Math.max(
      1,
      ...baseCategoryCounts.values()
    );
    const layout = getShapeBrowserLayout(
      this._viewportWidth,
      maxBaseCategoryItemCount
    );
    const appTheme = this.edgeless?.std?.get(ThemeProvider)?.app$?.value;

    return html`
      <div
        class="edgeless-shapes-panel"
        style=${styleMap({
          '--shape-browser-columns': String(layout.columns),
          '--shape-browser-panel-width': `${layout.panelWidth}px`,
        })}
        data-app-theme=${appTheme ?? 'light'}
      >
        <div
          class="search-bar ${this._captureSearchKeys ? 'capture-mode' : ''}"
        >
          <input
            class="search-input"
            type="text"
            placeholder="Search shapes..."
            @input=${this._updateSearchKeyword}
            @pointerdown=${(event: PointerEvent) => {
              event.preventDefault();
              stopPropagation(event);
              this._captureSearchKeys = true;
              this._forceFocusSearchInput();
            }}
            @click=${(event: MouseEvent) => {
              event.preventDefault();
              stopPropagation(event);
              this._captureSearchKeys = true;
              this._forceFocusSearchInput();
            }}
            @keydown=${this._stopNonEscapeKeydown}
            @cut=${stopPropagation}
            @copy=${stopPropagation}
            @paste=${stopPropagation}
          />
        </div>
        <div class="shape-categories">
          ${repeat(
            availableCategories,
            cat => cat.id,
            cat => html`
              <div
                class="category-entry ${effectiveCategory === cat.id
                  ? 'selected'
                  : ''}"
                @click=${() => this._selectCategory(cat.id)}
                @pointerdown=${() => {
                  this._captureSearchKeys = false;
                }}
              >
                ${cat.name}
              </div>
            `
          )}
        </div>
        <div class="shapes-viewport">
          <div class="shapes-scrollcontent" data-scrollable>
            <div class="shapes-list">
              ${shapesInCategory.length > 0
                ? repeat(
                    shapesInCategory,
                    item => item.id,
                    ({ name, generalIcon, tooltip }) => html`
                      <div
                        class="shape-item ${this.selectedShape === name
                          ? 'active'
                          : ''}"
                        @click=${() => this._onSelect(name)}
                        @pointerdown=${() => {
                          this._captureSearchKeys = false;
                        }}
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
          <overlay-scrollbar></overlay-scrollbar>
        </div>
        <div class="arrow">${Triangle}</div>
      </div>
    `;
  }
}
