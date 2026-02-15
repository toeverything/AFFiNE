import {
  darkToolbarStyles,
  lightToolbarStyles,
} from '@blocksuite/affine-components/toolbar';
import {
  type ShapeName,
  type ShapeStyle,
  ShapeType,
} from '@blocksuite/affine-model';
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

import { drawioLibraryCatalog } from '../drawio/library-catalog';
import {
  buildPathFromStencil,
  getStencilShapeData,
} from '../drawio/stencil-utils';
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
  diamond: 'general',
  triangle: 'general',
  triangleRight: 'general',
  hexagon: 'general',
  parallelogram: 'general',
  trapezoid: 'general',
  step: 'general',
  cylinder: 'general',
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
  stencilName?: string;
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
    id: 'ellipse',
    category: 'general',
    categoryLabel: BASE_CATEGORY_LABELS.general,
    ...SHAPE_CONFIG_BY_NAME.ellipse,
    tooltip: 'Ellipse',
  },
  {
    id: 'square',
    category: 'general',
    categoryLabel: BASE_CATEGORY_LABELS.general,
    ...SHAPE_CONFIG_BY_NAME.rect,
    tooltip: 'Square',
  },
  {
    id: 'circle',
    category: 'general',
    categoryLabel: BASE_CATEGORY_LABELS.general,
    ...SHAPE_CONFIG_BY_NAME.ellipse,
    tooltip: 'Circle',
  },
  ...AllShapeConfig.filter(
    item => !['rect', 'roundedRect', 'ellipse'].includes(item.name)
  ).map(item => ({
    ...item,
    id: item.name,
    category: SHAPE_CATEGORY_MAP[item.name],
    categoryLabel: BASE_CATEGORY_LABELS[SHAPE_CATEGORY_MAP[item.name]],
  })),
  ...drawioLibraryCatalog.map(entry => ({
    id: `lib:${entry.id}`,
    name: ShapeType.DrawioStencil,
    tooltip: entry.label,
    category: entry.categoryId,
    categoryLabel: entry.categoryLabel,
    stencilName: entry.stencilName,
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

const ICON_SIZE = 32;

const renderStencilIcon = (stencilName?: string) => {
  if (!stencilName) return html``;
  return html`<canvas
    class="stencil-icon-canvas"
    width="${ICON_SIZE}"
    height="${ICON_SIZE}"
    data-stencil="${stencilName}"
  ></canvas>`;
};

const buildIconPaths = (stencilName: string) => {
  const stencil = getStencilShapeData(stencilName);
  if (!stencil) return null;
  const basePaths = stencil.paths.length > 0 ? stencil.paths : stencil.strokes;
  const iconSize = 100;
  const isFiniteNumber = (value?: number) =>
    typeof value === 'number' && Number.isFinite(value);
  const sanitizeCommands = (commands: (typeof basePaths)[number]) =>
    commands.filter(command => {
      switch (command.cmd) {
        case 'M':
        case 'L':
          return isFiniteNumber(command.x) && isFiniteNumber(command.y);
        case 'C':
          return (
            isFiniteNumber(command.x1) &&
            isFiniteNumber(command.y1) &&
            isFiniteNumber(command.x2) &&
            isFiniteNumber(command.y2) &&
            isFiniteNumber(command.x) &&
            isFiniteNumber(command.y)
          );
        case 'Q':
          return (
            isFiniteNumber(command.x1) &&
            isFiniteNumber(command.y1) &&
            isFiniteNumber(command.x) &&
            isFiniteNumber(command.y)
          );
        case 'A':
          return (
            isFiniteNumber(command.rx) &&
            isFiniteNumber(command.ry) &&
            isFiniteNumber(command.x) &&
            isFiniteNumber(command.y)
          );
        case 'Z':
          return true;
      }
    });
  const sanitizedPaths = basePaths
    .map(commands => sanitizeCommands(commands))
    .filter(commands => commands.length > 0);
  const fillCommands = sanitizedPaths.filter(commands =>
    commands.some(cmd => cmd.cmd === 'Z')
  );
  const strokeSource = stencil.strokes.length > 0 ? stencil.strokes : basePaths;
  const strokeCommands = strokeSource
    .map(commands => sanitizeCommands(commands))
    .filter(commands => commands.length > 0);
  const backgroundPaths = fillCommands.map(commands =>
    buildPathFromStencil(commands, iconSize, iconSize)
  );
  const strokePaths = strokeCommands.map(commands =>
    buildPathFromStencil(commands, iconSize, iconSize)
  );
  return {
    backgroundPaths,
    strokePaths,
    iconSize,
  };
};

export class EdgelessShapeBrowserPanel extends WithDisposable(LitElement) {
  // Matching template-panel.ts styling exactly
  static override styles = css`
    :host {
      position: absolute;
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
      z-index: var(--affine-z-index-popover);
      pointer-events: auto;
    }

    .edgeless-shapes-panel {
      width: 467px;
      height: 400px;
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
    }

    .shapes-scrollcontent {
      overflow: auto;
      height: 100%;
      width: 100%;
    }

    .shapes-list {
      padding: 10px;
      display: flex;
      align-items: flex-start;
      align-content: flex-start;
      gap: 10px 20px;
      flex-wrap: wrap;
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

  @property({ attribute: false })
  accessor edgeless!: BlockComponent;

  @property({ attribute: false })
  accessor selectedShape: ShapeName | null | undefined = undefined;

  @property({ attribute: false })
  accessor selectedStencilName: string | null | undefined = undefined;

  @property({ attribute: false })
  accessor shapeStyle: ShapeStyle | undefined = undefined;

  private _closePanel() {
    this.dispatchEvent(new CustomEvent('closepanel'));
  }

  private _onSelect(value: ShapeName, stencilName?: string) {
    this.selectedShape = value;
    this.selectedStencilName = stencilName;
    this.dispatchEvent(
      new CustomEvent('shapeselect', {
        detail: { shapeName: value, stencilName },
      })
    );
  }

  private _selectCategory(category: ShapeCategory) {
    this._selectedCategory = category;
  }

  private _updateSearchKeyword(e: InputEvent) {
    this._searchKeyword = (e.target as HTMLInputElement).value;
  }

  private _getShapesForCategory(category: ShapeCategory) {
    let shapes = SHAPE_BROWSER_ITEMS.filter(
      shape => shape.category === category
    );

    // Filter by search keyword if present
    if (this._searchKeyword) {
      const keyword = this._searchKeyword.toLowerCase();
      shapes = shapes.filter(
        shape =>
          shape.name.toLowerCase().includes(keyword) ||
          shape.tooltip.toLowerCase().includes(keyword) ||
          shape.stencilName?.toLowerCase().includes(keyword)
      );
    }

    return shapes;
  }

  private _getAvailableCategories(): Array<{
    id: ShapeCategory;
    name: string;
  }> {
    const shapes = this._searchKeyword
      ? SHAPE_BROWSER_ITEMS.filter(shape => {
          const keyword = this._searchKeyword.toLowerCase();
          return (
            shape.name.toLowerCase().includes(keyword) ||
            shape.tooltip.toLowerCase().includes(keyword)
          );
        })
      : SHAPE_BROWSER_ITEMS;
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
    this.addEventListener('keydown', stopPropagation, false);
    this._disposables.addFromEvent(this, 'click', stopPropagation);
    this._disposables.addFromEvent(this, 'pointerdown', stopPropagation);
  }

  override updated() {
    const canvases = this.renderRoot.querySelectorAll(
      'canvas.stencil-icon-canvas'
    );
    canvases.forEach(canvas => {
      if (canvas.dataset.drawn === 'true') return;
      const stencilName = canvas.dataset.stencil;
      if (!stencilName) return;
      const result = buildIconPaths(stencilName);
      if (!result) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const color =
        getComputedStyle(canvas)
          .getPropertyValue('--affine-icon-color')
          .trim() || '#1f2937';
      const { backgroundPaths, strokePaths, iconSize } = result;
      const scale = canvas.width / iconSize;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(scale, scale);
      ctx.fillStyle = color;
      backgroundPaths.forEach(path => {
        ctx.fill(new Path2D(path));
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      strokePaths.forEach(path => {
        ctx.stroke(new Path2D(path));
      });
      ctx.restore();
      canvas.dataset.drawn = 'true';
    });
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
    const availableCategories = this._getAvailableCategories();
    const selectedCategory = availableCategories.find(
      cat => cat.id === this._selectedCategory
    )?.id;
    const effectiveCategory =
      selectedCategory ?? availableCategories[0]?.id ?? 'general';
    const shapesInCategory = this._getShapesForCategory(effectiveCategory);
    const appTheme = this.edgeless?.std?.get(ThemeProvider)?.app$?.value;

    return html`
      <div class="edgeless-shapes-panel" data-app-theme=${appTheme ?? 'light'}>
        <div class="search-bar">
          <input
            class="search-input"
            type="text"
            placeholder="Search shapes..."
            @input=${this._updateSearchKeyword}
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
                    ({ name, generalIcon, tooltip, stencilName }) => html`
                      <div
                        class="shape-item ${this.selectedShape === name &&
                        this.selectedStencilName === stencilName
                          ? 'active'
                          : ''}"
                        @click=${() => this._onSelect(name, stencilName)}
                      >
                        ${stencilName
                          ? renderStencilIcon(stencilName)
                          : generalIcon}
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
