import {
  EdgelessCRUDIdentifier,
  EdgelessLegacySlotIdentifier,
  isNoteBlock,
} from '@blocksuite/affine-block-surface';
import { SmallDocIcon } from '@blocksuite/affine-components/icons';
import {
  FrameBlockModel,
  NoteBlockModel,
  NoteDisplayMode,
  type RootBlockModel,
  SurfaceRefBlockModel,
} from '@blocksuite/affine-model';
import { FeatureFlagService } from '@blocksuite/affine-shared/services';
import { matchModels, stopPropagation } from '@blocksuite/affine-shared/utils';
import { Bound } from '@blocksuite/global/gfx';
import {
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
  InvisibleIcon,
} from '@blocksuite/icons/lit';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/std';
import {
  type GfxController,
  GfxControllerIdentifier,
} from '@blocksuite/std/gfx';
import { css, html, nothing, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { literal, unsafeStatic } from 'lit/static-html.js';

const PAGE_VISIBLE_INDEX_LABEL_WIDTH = 44;
const PAGE_VISIBLE_INDEX_LABEL_HEIGHT = 24;
const EDGELESS_ONLY_INDEX_LABEL_WIDTH = 24;
const EDGELESS_ONLY_INDEX_LABEL_HEIGHT = 24;
const INDEX_LABEL_OFFSET = 16;

function calculatePosition(gap: number, count: number, iconWidth: number) {
  const positions = [];
  if (count === 1) {
    positions.push([0, 10]);
    return positions;
  }
  const middleIndex = (count - 1) / 2;
  const isEven = count % 2 === 0;
  const middleOffset = (gap + iconWidth) / 2;
  function getSign(num: number) {
    return num - middleIndex > 0 ? 1 : -1;
  }
  for (let j = 0; j < count; j++) {
    let left = 10;
    if (isEven) {
      if (Math.abs(j - middleIndex) < 1) {
        left = 10 + middleOffset * getSign(j);
      } else {
        left =
          10 +
          ((Math.ceil(Math.abs(j - middleIndex)) - 1) * (gap + 24) +
            middleOffset) *
            getSign(j);
      }
    } else {
      const offset = gap + iconWidth;
      left = 10 + Math.ceil(Math.abs(j - middleIndex)) * offset * getSign(j);
    }
    positions.push([0, left]);
  }

  return positions;
}

function getIndexLabelTooltip(icon: TemplateResult, content: string) {
  const styles = css`
    .index-label-tooltip {
      display: flex;
      align-items: center;
      flex-wrap: nowrap;
      gap: 10px;
    }

    .index-label-tooltip-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .index-label-tooltip-content {
      font-size: var(--affine-font-sm);

      display: flex;
      height: 16px;
      line-height: 16px;
    }
  `;

  return html`<style>
      ${styles}
    </style>
    <div class="index-label-tooltip">
      <span class="index-label-tooltip-icon">${icon}</span>
      <span class="index-label-tooltip-content">${content}</span>
    </div>`;
}

type AutoConnectElement = NoteBlockModel | FrameBlockModel;

function isAutoConnectElement(element: unknown): element is AutoConnectElement {
  return (
    element instanceof NoteBlockModel || element instanceof FrameBlockModel
  );
}

export const AFFINE_EDGELESS_AUTO_CONNECT_WIDGET =
  'affine-edgeless-auto-connect-widget';

export class EdgelessAutoConnectWidget extends WidgetComponent<RootBlockModel> {
  static override styles = css`
    .page-visible-index-label {
      box-sizing: border-box;
      padding: 0px 6px;
      border: 1px solid #0000001a;

      width: fit-content;
      height: 24px;
      min-width: 24px;

      color: var(--affine-white);
      font-size: 15px;
      line-height: 22px;
      text-align: center;

      cursor: pointer;
      user-select: none;

      border-radius: 25px;
      background: var(--affine-primary-color);
    }

    .navigator {
      width: 48px;
      padding: 4px;
      border-radius: 58px;
      border: 1px solid rgba(227, 226, 228, 1);
      transition: opacity 0.5s ease-in-out;
      background: rgba(251, 251, 252, 1);
      display: flex;
      align-items: center;
      justify-content: space-between;
      opacity: 0;
    }

    .navigator div {
      display: flex;
      align-items: center;
      cursor: pointer;
    }

    .navigator span {
      display: inline-block;
      height: 8px;
      border: 1px solid rgba(227, 226, 228, 1);
    }

    .navigator div:hover {
      background: var(--affine-hover-color);
    }

    .navigator.show {
      opacity: 1;
    }
  `;

  private get _gfx(): GfxController {
    return this.std.get(GfxControllerIdentifier);
  }

  private get _crud() {
    return this.std.get(EdgelessCRUDIdentifier);
  }

  private get _viewport() {
    return this._gfx.viewport;
  }

  private get _selection() {
    return this._gfx.selection;
  }

  private readonly _updateLabels = () => {
    const doc = this.std.store;
    const root = doc.root;
    if (!root) return;
    const pageVisibleBlocks = new Map<AutoConnectElement, number>();
    const notes = root.children.filter(child =>
      matchModels(child, [NoteBlockModel])
    );

    const edgelessOnlyNotesSet = new Set<NoteBlockModel>();

    notes.forEach(note => {
      if (isNoteBlock(note)) {
        if (note.props.displayMode$.value === NoteDisplayMode.EdgelessOnly) {
          edgelessOnlyNotesSet.add(note);
        } else if (
          note.props.displayMode$.value === NoteDisplayMode.DocAndEdgeless
        ) {
          pageVisibleBlocks.set(note, 1);
        }
      }

      note.children.forEach(model => {
        if (matchModels(model, [SurfaceRefBlockModel])) {
          const reference = this._crud.getElementById(model.props.reference);

          if (!isAutoConnectElement(reference)) return;

          if (!pageVisibleBlocks.has(reference)) {
            pageVisibleBlocks.set(reference, 1);
          } else {
            pageVisibleBlocks.set(
              reference,
              pageVisibleBlocks.get(reference)! + 1
            );
          }
        }
      });
    });

    this._edgelessOnlyNotesSet = edgelessOnlyNotesSet;
    this._pageVisibleElementsMap = pageVisibleBlocks;
  };

  private _EdgelessOnlyLabels() {
    const { _edgelessOnlyNotesSet } = this;

    if (!_edgelessOnlyNotesSet.size) return nothing;

    return html`${repeat(
      _edgelessOnlyNotesSet,
      note => note.id,
      note => {
        const viewport = this._viewport;
        const { zoom } = viewport;
        const bound = Bound.deserialize(note.xywh);
        const [left, right] = viewport.toViewCoord(bound.x, bound.y);
        const [width, height] = [bound.w * zoom, bound.h * zoom];
        const style = styleMap({
          width: `${EDGELESS_ONLY_INDEX_LABEL_WIDTH}px`,
          height: `${EDGELESS_ONLY_INDEX_LABEL_HEIGHT}px`,
          borderRadius: '50%',
          backgroundColor: 'var(--affine-text-secondary-color)',
          border: '1px solid var(--affine-border-color)',
          color: 'var(--affine-white)',
          position: 'absolute',
          transform: `translate(${
            left + width / 2 - EDGELESS_ONLY_INDEX_LABEL_WIDTH / 2
          }px,
          ${right + height + INDEX_LABEL_OFFSET}px)`,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        });

        return html`<div style=${style} class="edgeless-only-index-label">
          ${InvisibleIcon({ width: '20px', height: '20px' })}
          <affine-tooltip tip-position="bottom">
            ${getIndexLabelTooltip(SmallDocIcon, 'Hidden on page')}
          </affine-tooltip>
        </div>`;
      }
    )}`;
  }

  private _getElementsAndCounts() {
    const elements: AutoConnectElement[] = [];
    const counts: number[] = [];

    for (const [key, value] of this._pageVisibleElementsMap.entries()) {
      elements.push(key);
      counts.push(value);
    }

    return { elements, counts };
  }

  private _initLabels() {
    if (!this.block) {
      return;
    }
    const surfaceRefs = this.block.std.store
      .getBlocksByFlavour('affine:surface-ref')
      .map(block => block.model) as SurfaceRefBlockModel[];

    const getVisibility = () => {
      const { selectedElements } = this._selection;

      if (
        selectedElements.length === 1 &&
        !this._selection.editing &&
        (isNoteBlock(selectedElements[0]) ||
          surfaceRefs.some(
            ref => ref.props.reference === selectedElements[0].id
          ))
      ) {
        this._show = true;
      } else {
        this._show = false;
      }

      return this._show;
    };

    this._disposables.add(
      this._selection.slots.updated.subscribe(() => {
        getVisibility();
      })
    );
    this._disposables.add(
      this.store.slots.blockUpdated.subscribe(payload => {
        if (payload.flavour === 'affine:surface-ref') {
          switch (payload.type) {
            case 'add':
              surfaceRefs.push(payload.model as SurfaceRefBlockModel);
              break;
            case 'delete':
              {
                const idx = surfaceRefs.indexOf(
                  payload.model as SurfaceRefBlockModel
                );
                if (idx >= 0) {
                  surfaceRefs.splice(idx, 1);
                }
              }
              break;
            case 'update':
              if (payload.props.key !== 'reference') {
                return;
              }
          }

          this.requestUpdate();
        }
      })
    );
    const surface = this._gfx.surface;
    if (surface) {
      this._disposables.add(
        surface.elementUpdated.subscribe(payload => {
          if (
            payload.props['xywh'] &&
            surfaceRefs.some(ref => ref.props.reference === payload.id)
          ) {
            this.requestUpdate();
          }
        })
      );
    }
  }

  private _navigateToNext() {
    const { elements } = this._getElementsAndCounts();
    if (this._index >= elements.length - 1) return;
    this._index = this._index + 1;
    const element = elements[this._index];
    const bound = Bound.deserialize(element.xywh);
    this._selection.set({
      elements: [element.id],
      editing: false,
    });
    this._viewport.setViewportByBound(bound, [80, 80, 80, 80], true);
  }

  private _navigateToPrev() {
    const { elements } = this._getElementsAndCounts();
    if (this._index <= 0) return;
    this._index = this._index - 1;
    const element = elements[this._index];
    const bound = Bound.deserialize(element.xywh);
    this._selection.set({
      elements: [element.id],
      editing: false,
    });
    this._viewport.setViewportByBound(bound, [80, 80, 80, 80], true);
  }

  private _NavigatorComponent(elements: AutoConnectElement[]) {
    const viewport = this._viewport;
    const { zoom } = viewport;
    const className = `navigator ${this._index >= 0 ? 'show' : 'hidden'}`;
    const element = elements[this._index];
    const bound = Bound.deserialize(element.xywh);
    const [left, right] = viewport.toViewCoord(bound.x, bound.y);
    const [width, height] = [bound.w * zoom, bound.h * zoom];
    const navigatorStyle = styleMap({
      position: 'absolute',
      transform: `translate(${left + width / 2 - 26}px, ${
        right + height + 16
      }px)`,
    });

    const iconStyle = {
      width: '16px',
      height: '16px',
      style: 'color:#77757D;',
    };

    return html`<div class=${className} style=${navigatorStyle}>
      <div
        role="button"
        class="edgeless-auto-connect-previous-button"
        @pointerdown=${(e: PointerEvent) => {
          stopPropagation(e);
          this._navigateToPrev();
        }}
      >
        ${ArrowLeftSmallIcon(iconStyle)}
      </div>
      <span></span>
      <div
        role="button"
        class="edgeless-auto-connect-next-button"
        @pointerdown=${(e: PointerEvent) => {
          stopPropagation(e);
          this._navigateToNext();
        }}
      >
        ${ArrowRightSmallIcon(iconStyle)}
      </div>
    </div> `;
  }

  private _PageVisibleIndexLabels(
    elements: AutoConnectElement[],
    counts: number[]
  ) {
    const viewport = this._viewport;
    const { zoom } = viewport;
    let index = 0;

    return html`${repeat(
      elements,
      element => element.id,
      (element, i) => {
        const bound = Bound.deserialize(element.xywh$.value);
        const [left, right] = viewport.toViewCoord(bound.x, bound.y);
        const [width, height] = [bound.w * zoom, bound.h * zoom];
        const style = styleMap({
          width: `${PAGE_VISIBLE_INDEX_LABEL_WIDTH}px`,
          maxWidth: `${PAGE_VISIBLE_INDEX_LABEL_WIDTH}px`,
          height: `${PAGE_VISIBLE_INDEX_LABEL_HEIGHT}px`,
          position: 'absolute',
          transform: `translate(${
            left + width / 2 - PAGE_VISIBLE_INDEX_LABEL_WIDTH / 2
          }px,
          ${right + height + INDEX_LABEL_OFFSET}px)`,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        });
        const components: TemplateResult[] = [];
        const count = counts[i];
        const initGap = 24 / count - 24;
        const positions = calculatePosition(
          initGap,
          count,
          PAGE_VISIBLE_INDEX_LABEL_HEIGHT
        );

        for (let j = 0; j < count; j++) {
          index++;
          components.push(html`
            <div
              style=${styleMap({
                position: 'absolute',
                top: positions[j][0] + 'px',
                left: positions[j][1] + 'px',
                transition: 'all 0.1s linear',
              })}
              index=${i}
              class="page-visible-index-label"
              @pointerdown=${(e: PointerEvent) => {
                stopPropagation(e);
                this._index = this._index === i ? -1 : i;
              }}
            >
              ${index}
              <affine-tooltip tip-position="bottom">
                ${getIndexLabelTooltip(SmallDocIcon, 'Page mode index')}
              </affine-tooltip>
            </div>
          `);
        }

        function updateChildrenPosition(e: MouseEvent, positions: number[][]) {
          if (!e.target) return;
          const children = (e.target as HTMLElement).children;
          (Array.from(children) as HTMLElement[]).forEach((c, index) => {
            c.style.top = positions[index][0] + 'px';
            c.style.left = positions[index][1] + 'px';
          });
        }

        return html`<div
          style=${style}
          @mouseenter=${(e: MouseEvent) => {
            const positions = calculatePosition(
              5,
              count,
              PAGE_VISIBLE_INDEX_LABEL_HEIGHT
            );
            updateChildrenPosition(e, positions);
          }}
          @mouseleave=${(e: MouseEvent) => {
            const positions = calculatePosition(
              initGap,
              count,
              PAGE_VISIBLE_INDEX_LABEL_HEIGHT
            );
            updateChildrenPosition(e, positions);
          }}
        >
          ${components}
        </div>`;
      }
    )}`;
  }

  private _setHostStyle() {
    this.style.position = 'absolute';
    this.style.top = '0';
    this.style.left = '0';
    this.style.zIndex = '1';
  }

  override connectedCallback(): void {
    super.connectedCallback();

    this._setHostStyle();
    this._initLabels();
  }

  override firstUpdated(): void {
    const { _disposables, std } = this;
    const slots = std.get(EdgelessLegacySlotIdentifier);
    const gfx = std.get(GfxControllerIdentifier);

    _disposables.add(
      gfx.viewport.viewportUpdated.subscribe(() => {
        this.requestUpdate();
      })
    );

    _disposables.add(
      gfx.selection.slots.updated.subscribe(() => {
        const { selectedElements } = gfx.selection;
        if (
          !(selectedElements.length === 1 && isNoteBlock(selectedElements[0]))
        ) {
          this._index = -1;
        }
      })
    );

    _disposables.add(
      std.event.add('dragStart', () => {
        this._dragging = true;
      })
    );
    _disposables.add(
      std.event.add('dragEnd', () => {
        this._dragging = false;
      })
    );
    _disposables.add(
      slots.elementResizeStart.subscribe(() => {
        this._dragging = true;
      })
    );
    _disposables.add(
      slots.elementResizeEnd.subscribe(() => {
        this._dragging = false;
      })
    );
  }

  override render() {
    const advancedVisibilityEnabled = this.store
      .get(FeatureFlagService)
      .getFlag('enable_advanced_block_visibility');

    if (!this._show || this._dragging || !advancedVisibilityEnabled) {
      return nothing;
    }

    this._updateLabels();

    const { elements, counts } = this._getElementsAndCounts();

    return html`${this._PageVisibleIndexLabels(elements, counts)}
    ${this._EdgelessOnlyLabels()}
    ${this._index >= 0 && this._index < elements.length
      ? this._NavigatorComponent(elements)
      : nothing} `;
  }

  @state()
  private accessor _dragging = false;

  @state()
  private accessor _edgelessOnlyNotesSet = new Set<NoteBlockModel>();

  @state()
  private accessor _index = -1;

  @state()
  private accessor _pageVisibleElementsMap: Map<AutoConnectElement, number> =
    new Map();

  @state()
  private accessor _show = false;
}

export const autoConnectWidget = WidgetViewExtension(
  'affine:page',
  AFFINE_EDGELESS_AUTO_CONNECT_WIDGET,
  literal`${unsafeStatic(AFFINE_EDGELESS_AUTO_CONNECT_WIDGET)}`
);

declare global {
  interface HTMLElementTagNameMap {
    'affine-edgeless-auto-connect-widget': EdgelessAutoConnectWidget;
  }
}
