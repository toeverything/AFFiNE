import type { NoteBlockComponent } from '@blocksuite/affine-block-note';
import {
  EdgelessLegacySlotIdentifier,
  getSurfaceComponent,
  isNoteBlock,
} from '@blocksuite/affine-block-surface';
import {
  DEFAULT_NOTE_HEIGHT,
  type NoteBlockModel,
  type RootBlockModel,
} from '@blocksuite/affine-model';
import { EDGELESS_BLOCK_CHILD_PADDING } from '@blocksuite/affine-shared/consts';
import { TelemetryProvider } from '@blocksuite/affine-shared/services';
import { getRectByBlockComponent } from '@blocksuite/affine-shared/utils';
import type { EdgelessSelectedRectWidget } from '@blocksuite/affine-widget-edgeless-selected-rect';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { deserializeXYWH, Point, serializeXYWH } from '@blocksuite/global/gfx';
import { ScissorsIcon } from '@blocksuite/icons/lit';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { css, html, nothing, type PropertyValues } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { literal, unsafeStatic } from 'lit/static-html.js';

const DIVIDING_LINE_OFFSET = 4;
const NEW_NOTE_GAP = 40;

const styles = css`
  :host {
    display: flex;
  }

  .note-slicer-container {
    display: flex;
  }

  .note-slicer-button {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    box-sizing: border-box;
    border-radius: 4px;
    justify-content: center;
    align-items: center;
    color: var(--affine-icon-color);
    border: 1px solid var(--affine-border-color);
    background-color: var(--affine-background-overlay-panel-color);
    box-shadow: var(--affine-menu-shadow);
    cursor: pointer;
    width: 24px;
    height: 24px;
    transform-origin: left top;
    z-index: var(--affine-z-index-popover);
    opacity: 0;
    transition: opacity 150ms cubic-bezier(0.25, 0.1, 0.25, 1);
  }

  .note-slicer-dividing-line-container {
    display: flex;
    align-items: center;
    position: absolute;
    left: 0;
    top: 0;
    height: 4px;
    cursor: pointer;
  }

  .note-slicer-dividing-line {
    display: block;
    height: 1px;
    width: 100%;
    z-index: var(--affine-z-index-popover);
    background-image: linear-gradient(
      to right,
      var(--affine-black-10) 50%,
      transparent 50%
    );
    background-size: 4px 100%;
  }
  .note-slicer-dividing-line-container.active .note-slicer-dividing-line {
    background-image: linear-gradient(
      to right,
      var(--affine-black-60) 50%,
      transparent 50%
    );
    animation: slide 0.3s linear infinite;
  }
  @keyframes slide {
    0% {
      background-position: 0 0;
    }
    100% {
      background-position: -4px 0;
    }
  }
`;

export const NOTE_SLICER_WIDGET = 'note-slicer';

export class NoteSlicer extends WidgetComponent<RootBlockModel> {
  static override styles = styles;

  private _divingLinePositions: Point[] = [];

  private _hidden = false;

  private _noteBlockIds: string[] = [];

  private _noteDisposables: DisposableGroup | null = null;

  get _editorHost() {
    return this.std.host;
  }

  get _noteBlock() {
    if (!this._editorHost) return null;
    const noteBlock = this._editorHost.view.getBlock(
      this._anchorNote?.id ?? ''
    );
    return noteBlock ? (noteBlock as NoteBlockComponent) : null;
  }

  get _selection() {
    return this.gfx.selection;
  }

  get _viewportOffset() {
    const { viewport } = this.gfx;
    return {
      left: viewport.left ?? 0,
      top: viewport.top ?? 0,
    };
  }

  get _zoom() {
    return this.gfx.viewport.zoom;
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get selectedRectEle() {
    return this.host.view.getWidget(
      'edgeless-selected-rect',
      this.host.id
    ) as EdgelessSelectedRectWidget | null;
  }

  private _sliceNote() {
    if (!this._anchorNote || !this._noteBlockIds.length) return;
    const doc = this.store;

    const {
      index: originalIndex,
      xywh,
      background,
      displayMode,
    } = this._anchorNote.props;
    const originalNoteIndex = this._anchorNote.parent?.children.findIndex(
      child => child === this._anchorNote
    );
    const { children } = this._anchorNote;
    const {
      collapse: _,
      collapsedHeight: __,
      ...restOfEdgeless
    } = this._anchorNote.props.edgeless;
    const anchorBlockId = this._noteBlockIds[this._activeSlicerIndex];
    if (!anchorBlockId) return;
    const sliceIndex = children.findIndex(block => block.id === anchorBlockId);
    const resetBlocks = children.slice(sliceIndex + 1);
    const [x, , width] = deserializeXYWH(xywh);
    const sliceVerticalPos =
      this._divingLinePositions[this._activeSlicerIndex].y;
    const newY = this.gfx.viewport.toModelCoord(x, sliceVerticalPos)[1];
    const newNoteId = this.store.addBlock(
      'affine:note',
      {
        background,
        displayMode,
        xywh: serializeXYWH(x, newY + NEW_NOTE_GAP, width, DEFAULT_NOTE_HEIGHT),
        index: originalIndex + 1,
        edgeless: restOfEdgeless,
      },
      doc.root?.id,
      originalNoteIndex ? originalNoteIndex + 1 : undefined
    );

    doc.moveBlocks(resetBlocks, doc.getModelById(newNoteId) as NoteBlockModel);

    this._activeSlicerIndex = 0;
    this._selection.set({
      elements: [newNoteId],
      editing: false,
    });

    this.std.getOptional(TelemetryProvider)?.track('SplitNote', {
      control: 'NoteSlicer',
    });
  }

  private _updateActiveSlicerIndex(pos: Point) {
    const { _divingLinePositions } = this;
    const curY = pos.y + DIVIDING_LINE_OFFSET * this._zoom;
    let index = -1;
    for (let i = 0; i < _divingLinePositions.length; i++) {
      const currentY = _divingLinePositions[i].y;
      const previousY = i > 0 ? _divingLinePositions[i - 1].y : 0;
      const midY = (currentY + previousY) / 2;
      if (curY < midY) {
        break;
      }
      index++;
    }

    if (index < 0) index = 0;
    this._activeSlicerIndex = index;
  }

  private _updateDivingLineAndBlockIds() {
    if (!this._anchorNote || !this._noteBlock) {
      this._divingLinePositions = [];
      this._noteBlockIds = [];
      return;
    }

    const divingLinePositions: Point[] = [];
    const noteBlockIds: string[] = [];
    const noteRect = this._noteBlock.getBoundingClientRect();
    const noteTop = noteRect.top;
    const noteBottom = noteRect.bottom;

    for (let i = 0; i < this._anchorNote.children.length - 1; i++) {
      const child = this._anchorNote.children[i];
      const rect = this.host.view.getBlock(child.id)?.getBoundingClientRect();

      if (rect && rect.bottom > noteTop && rect.bottom < noteBottom) {
        const x = rect.x - this._viewportOffset.left;
        const y =
          rect.bottom +
          DIVIDING_LINE_OFFSET * this._zoom -
          this._viewportOffset.top;
        divingLinePositions.push(new Point(x, y));
        noteBlockIds.push(child.id);
      }
    }

    this._divingLinePositions = divingLinePositions;
    this._noteBlockIds = noteBlockIds;
  }

  private _updateSlicedNote() {
    const { selectedElements } = this.gfx.selection;

    if (
      !this.gfx.selection.editing &&
      selectedElements.length === 1 &&
      isNoteBlock(selectedElements[0])
    ) {
      this._anchorNote = selectedElements[0];
    } else {
      this._anchorNote = null;
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();

    const { disposables, std, gfx } = this;

    this._updateDivingLineAndBlockIds();

    const slots = std.get(EdgelessLegacySlotIdentifier);

    disposables.add(
      slots.elementResizeStart.subscribe(() => {
        this._isResizing = true;
      })
    );

    disposables.add(
      slots.elementResizeEnd.subscribe(() => {
        this._isResizing = false;
      })
    );

    disposables.add(
      std.event.add('pointerMove', ctx => {
        if (this._hidden) this._hidden = false;

        const state = ctx.get('pointerState');
        const pos = new Point(state.x, state.y);
        this._updateActiveSlicerIndex(pos);
      })
    );

    disposables.add(
      gfx.viewport.viewportUpdated.subscribe(() => {
        this._hidden = true;
        this.requestUpdate();
      })
    );

    disposables.add(
      gfx.selection.slots.updated.subscribe(() => {
        this._enableNoteSlicer = false;
        this._updateSlicedNote();

        if (this.selectedRectEle) {
          this.selectedRectEle.autoCompleteOff = false;
        }
      })
    );

    disposables.add(
      slots.toggleNoteSlicer.subscribe(() => {
        this._enableNoteSlicer = !this._enableNoteSlicer;

        if (this.selectedRectEle && this._enableNoteSlicer) {
          this.selectedRectEle.autoCompleteOff = true;
        }
      })
    );

    requestAnimationFrame(() => {
      const surface = getSurfaceComponent(std);
      if (surface?.isConnected && std.event) {
        disposables.add(
          std.event.add('click', ctx => {
            const event = ctx.get('pointerState');
            const { raw } = event;
            const target = raw.target as HTMLElement;
            if (!target) return;

            if (target.closest('note-slicer')) {
              this._sliceNote();
            }
          })
        );
      }
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.disposables.dispose();
    this._noteDisposables?.dispose();
    this._noteDisposables = null;
  }

  override firstUpdated() {
    if (!this.block?.service) return;
    this.disposables.add(
      this.block.service.uiEventDispatcher.add('wheel', () => {
        this._hidden = true;
        this.requestUpdate();
      })
    );
  }

  override render() {
    if (
      this.store.readonly ||
      this._hidden ||
      this._isResizing ||
      !this._anchorNote ||
      !this._enableNoteSlicer
    ) {
      return nothing;
    }

    this._updateDivingLineAndBlockIds();

    const noteBlock = this._noteBlock;
    if (!noteBlock || !this._divingLinePositions.length) return nothing;

    const rect = getRectByBlockComponent(noteBlock);
    const width = rect.width - 2 * EDGELESS_BLOCK_CHILD_PADDING * this._zoom;
    const buttonPosition = this._divingLinePositions[this._activeSlicerIndex];

    return html`<div class="note-slicer-container">
      <div
        class="note-slicer-button"
        style=${styleMap({
          left: `${buttonPosition.x - 66 * this._zoom}px`,
          top: `${buttonPosition.y}px`,
          opacity: 1,
          transform: 'translateY(-50%)',
        })}
      >
        ${ScissorsIcon({ width: '16px', height: '16px' })}
      </div>
      ${this._divingLinePositions.map((pos, idx) => {
        const dividingLineClasses = classMap({
          'note-slicer-dividing-line-container': true,
          active: idx === this._activeSlicerIndex,
        });
        return html`<div
          class=${dividingLineClasses}
          style=${styleMap({
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            width: `${width}px`,
          })}
        >
          <span class="note-slicer-dividing-line"></span>
        </div>`;
      })}
    </div> `;
  }

  protected override updated(_changedProperties: PropertyValues) {
    super.updated(_changedProperties);
    if (_changedProperties.has('anchorNote')) {
      this._noteDisposables?.dispose();
      this._noteDisposables = null;
      if (this._anchorNote) {
        this._noteDisposables = new DisposableGroup();
        this._noteDisposables.add(
          this._anchorNote.propsUpdated.subscribe(({ key }) => {
            if (key === 'children' || key === 'xywh') {
              this.requestUpdate();
            }
          })
        );
      }
    }
  }

  @state()
  private accessor _activeSlicerIndex = 0;

  @state()
  private accessor _anchorNote: NoteBlockModel | null = null;

  @state()
  private accessor _enableNoteSlicer = false;

  @state()
  private accessor _isResizing = false;
}

export const noteSlicerWidget = WidgetViewExtension(
  'affine:page',
  NOTE_SLICER_WIDGET,
  literal`${unsafeStatic(NOTE_SLICER_WIDGET)}`
);
