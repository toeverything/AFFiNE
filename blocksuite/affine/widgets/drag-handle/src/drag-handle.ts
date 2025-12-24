import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import type { RootBlockModel } from '@blocksuite/affine-model';
import { DocModeProvider } from '@blocksuite/affine-shared/services';
import {
  isInsideEdgelessEditor,
  isInsidePageEditor,
} from '@blocksuite/affine-shared/utils';
import { DisposableGroup } from '@blocksuite/global/disposable';
import type { IVec, Point, Rect } from '@blocksuite/global/gfx';
import { type BlockComponent, WidgetComponent } from '@blocksuite/std';
import type { GfxModel } from '@blocksuite/std/gfx';
import { computed, type ReadonlySignal, signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { AFFINE_DRAG_HANDLE_WIDGET } from './consts.js';
import { RectHelper } from './helpers/rect-helper.js';
import { SelectionHelper } from './helpers/selection-helper.js';
import { styles } from './styles.js';
import { updateDragHandleClassName } from './utils.js';
import { DragEventWatcher } from './watchers/drag-event-watcher.js';
import { EdgelessWatcher } from './watchers/edgeless-watcher.js';
import { HandleEventWatcher } from './watchers/handle-event-watcher.js';
import { KeyboardEventWatcher } from './watchers/keyboard-event-watcher.js';
import { PageWatcher } from './watchers/page-watcher.js';
import { PointerEventWatcher } from './watchers/pointer-event-watcher.js';

export class AffineDragHandleWidget extends WidgetComponent<RootBlockModel> {
  static override styles = styles;

  private _anchorModelDisposables: DisposableGroup | null = null;

  /**
   * Used to handle drag behavior
   */
  private readonly _dragEventWatcher = new DragEventWatcher(this);

  private readonly _handleEventWatcher = new HandleEventWatcher(this);

  private readonly _keyboardEventWatcher = new KeyboardEventWatcher(this);

  private readonly _pageWatcher = new PageWatcher(this);

  private readonly _reset = () => {
    this.dragging = false;

    this.isDragHandleHovered = false;

    this.pointerEventWatcher.reset();
  };

  @state()
  accessor activeDragHandle: 'block' | 'gfx' | null = null;

  anchorBlockId = signal<string | null>(null);

  anchorBlockComponent = computed<BlockComponent | null>(() => {
    if (!this.anchorBlockId.value) return null;

    return this.std.view.getBlock(this.anchorBlockId.value);
  });

  anchorEdgelessElement: ReadonlySignal<GfxModel | null> = computed(() => {
    if (!this.anchorBlockId.value) return null;
    if (this.mode === 'page') return null;

    const crud = this.std.get(EdgelessCRUDIdentifier);
    const edgelessElement = crud.getElementById(this.anchorBlockId.value);
    return edgelessElement;
  });

  // Single block: drag handle should show on the vertical middle of the first line of element
  center: IVec = [0, 0];

  dragging = false;

  rectHelper = new RectHelper(this);

  draggingAreaRect: ReadonlySignal<Rect | null> = computed(
    this.rectHelper.getDraggingAreaRect
  );

  lastDragPoint: Point | null = null;

  edgelessWatcher = new EdgelessWatcher(this);

  handleAnchorModelDisposables = () => {
    const block = this.anchorBlockComponent.peek();
    if (!block) return;
    const blockModel = block.model;

    if (this._anchorModelDisposables) {
      this._anchorModelDisposables.dispose();
      this._anchorModelDisposables = null;
    }

    this._anchorModelDisposables = new DisposableGroup();

    this._anchorModelDisposables.add(
      blockModel.deleted.subscribe(() => this.hide())
    );
  };

  /**
   * @param force Reset the dragging state
   */
  hide = (force = false) => {
    if (this.dragging && !force) return;
    updateDragHandleClassName();

    this.isDragHandleHovered = false;

    this.anchorBlockId.value = null;
    this.dragHoverRect = null;
    this.activeDragHandle = null;

    if (this.dragHandleContainer) {
      this.dragHandleContainer.removeAttribute('style');
      this.dragHandleContainer.style.display = 'none';
    }
    if (this.dragHandleGrabber) {
      this.dragHandleGrabber.removeAttribute('style');
    }

    if (force) {
      this._reset();
    }
  };

  isDragHandleHovered = false;

  get isBlockDragHandleVisible() {
    return this.activeDragHandle === 'block';
  }

  get isGfxDragHandleVisible() {
    return this.activeDragHandle === 'gfx';
  }

  noteScale = signal(1);

  pointerEventWatcher = new PointerEventWatcher(this);

  scale = signal(1);

  scaleInNote = computed(() => this.scale.value * this.noteScale.value);

  selectionHelper = new SelectionHelper(this);

  get dragHandleContainerOffsetParent() {
    return this.dragHandleContainer.parentElement!;
  }

  get mode() {
    return this.std.get(DocModeProvider).getEditorMode();
  }

  get rootComponent() {
    return this.block;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.pointerEventWatcher.watch();
    this._keyboardEventWatcher.watch();
    this._dragEventWatcher.watch();
  }

  override disconnectedCallback() {
    this.hide(true);
    this._disposables.dispose();
    this._anchorModelDisposables?.dispose();
    super.disconnectedCallback();
  }

  override firstUpdated() {
    this.hide(true);
    this._disposables.addFromEvent(this.host, 'pointerleave', () => {
      this.hide();
    });
    this._handleEventWatcher.watch();

    if (isInsidePageEditor(this.host)) {
      this._pageWatcher.watch();
    } else if (isInsideEdgelessEditor(this.host)) {
      this.edgelessWatcher.watch();
    }
  }

  override render() {
    const hoverRectStyle = styleMap(
      this.dragHoverRect && this.activeDragHandle
        ? {
            width: `${this.dragHoverRect.width}px`,
            height: `${this.dragHoverRect.height}px`,
            top: `${this.dragHoverRect.top}px`,
            left: `${this.dragHoverRect.left}px`,
          }
        : {
            display: 'none',
          }
    );
    const isGfx = this.activeDragHandle === 'gfx';
    const classes = {
      'affine-drag-handle-grabber': true,
      dots: isGfx ? true : false,
    };

    return html`
      <div class="affine-drag-handle-widget">
        <div class="affine-drag-handle-container">
          <div class=${classMap(classes)}>
            ${isGfx
              ? html`
                  <div class="dot"></div>
                  <div class="dot"></div>
                  <div class="dot"></div>
                  <div class="dot"></div>
                  <div class="dot"></div>
                  <div class="dot"></div>
                `
              : nothing}
          </div>
        </div>
        <div class="affine-drag-hover-rect" style=${hoverRectStyle}></div>
      </div>
    `;
  }

  @query('.affine-drag-handle-container')
  accessor dragHandleContainer!: HTMLDivElement;

  @query('.affine-drag-handle-grabber')
  accessor dragHandleGrabber!: HTMLDivElement;

  @state()
  accessor dragHoverRect: {
    width: number;
    height: number;
    left: number;
    top: number;
  } | null = null;
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_DRAG_HANDLE_WIDGET]: AffineDragHandleWidget;
  }
}
