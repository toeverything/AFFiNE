import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine-block-surface';
import type { DocTitle } from '@blocksuite/affine-fragment-doc-title';
import { NoteBlockSchema, NoteDisplayMode } from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import { EDGELESS_BLOCK_CHILD_PADDING } from '@blocksuite/affine-shared/consts';
import { TelemetryProvider } from '@blocksuite/affine-shared/services';
import {
  handleNativeRangeAtPoint,
  stopPropagation,
} from '@blocksuite/affine-shared/utils';
import { Bound } from '@blocksuite/global/gfx';
import { toGfxBlockComponent } from '@blocksuite/std';
import {
  type BoxSelectionContext,
  GfxViewInteractionExtension,
} from '@blocksuite/std/gfx';
import { html, nothing, type PropertyValues } from 'lit';
import { query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { styleMap } from 'lit/directives/style-map.js';
import clamp from 'lodash-es/clamp';

import { MoreIndicator } from './components/more-indicator';
import { NoteConfigExtension } from './config';
import { NoteBlockComponent } from './note-block';
import { ACTIVE_NOTE_EXTRA_PADDING } from './note-edgeless-block.css';
import * as styles from './note-edgeless-block.css';

export const AFFINE_EDGELESS_NOTE = 'affine-edgeless-note';

export class EdgelessNoteBlockComponent extends toGfxBlockComponent(
  NoteBlockComponent
) {
  private get _isShowCollapsedContent() {
    return (
      !!this.model.props.edgeless.collapse &&
      this.selected$.value &&
      !this._dragging &&
      (this._isResizing || this._isHover || this._editing)
    );
  }

  private get _dragging() {
    return this._isHover && this.gfx.tool.dragging$.value;
  }

  private _collapsedContent() {
    if (!this._isShowCollapsedContent) {
      return nothing;
    }

    const { xywh, edgeless } = this.model.props;
    const { borderSize } = edgeless.style;

    const extraPadding = this._editing ? ACTIVE_NOTE_EXTRA_PADDING : 0;
    const extraBorder = this._editing ? borderSize : 0;
    const bound = Bound.deserialize(xywh);
    const scale = edgeless.scale ?? 1;
    const width = bound.w / scale + extraPadding * 2 + extraBorder;
    const height = bound.h / scale;

    const rect = this._noteContent?.getBoundingClientRect();
    if (!rect) return nothing;

    const zoom = this.gfx.viewport.zoom;
    this._noteFullHeight =
      rect.height / scale / zoom + 2 * EDGELESS_BLOCK_CHILD_PADDING;

    if (height >= this._noteFullHeight) {
      return nothing;
    }

    return html`
      <div
        class=${styles.collapsedContent}
        style=${styleMap({
          width: `${width}px`,
          height: `${this._noteFullHeight - height}px`,
          left: `${-(extraPadding + extraBorder / 2)}px`,
          top: `${height + extraPadding + extraBorder / 2}px`,
        })}
      ></div>
    `;
  }

  private _handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      this._docTitle?.inlineEditor?.focusEnd();
    }
  }

  private _hovered() {
    if (
      this.selection.value.some(
        sel => sel.type === 'surface' && sel.blockId === this.model.id
      )
    ) {
      if (this._hoverTimeout) {
        clearTimeout(this._hoverTimeout);
        this._hoverTimeout = null;
      }
      this._isHover = true;
    }
  }

  private _hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  private _leaved(e: MouseEvent) {
    if (this._hoverTimeout) {
      clearTimeout(this._hoverTimeout);
      this._hoverTimeout = null;
    }
    const rect = this.getBoundingClientRect();
    const threshold = -10;
    const leavedFromBottom =
      e.clientY - rect.bottom > threshold &&
      rect.left < e.clientX &&
      e.clientX < rect.right;

    if (leavedFromBottom) {
      this._hoverTimeout = setTimeout(() => {
        this._isHover = false;
      }, 300);
    } else {
      this._isHover = false;
    }
  }

  private _setCollapse(event: MouseEvent) {
    event.stopImmediatePropagation();

    const { collapse, collapsedHeight } = this.model.props.edgeless;

    if (collapse) {
      this.model.store.updateBlock(this.model, () => {
        this.model.props.edgeless.collapse = false;
      });
    } else if (collapsedHeight) {
      const { xywh, edgeless } = this.model.props;
      const bound = Bound.deserialize(xywh);
      bound.h = collapsedHeight * (edgeless.scale ?? 1);
      this.model.store.updateBlock(this.model, () => {
        this.model.props.edgeless.collapse = true;
        this.model.props.xywh = bound.serialize();
      });
    }

    this.selection.clear();
  }

  override connectedCallback(): void {
    super.connectedCallback();

    const selection = this.gfx.selection;

    this._editing = selection.has(this.model.id) && selection.editing;
    this._disposables.add(
      selection.slots.updated.subscribe(() => {
        if (selection.has(this.model.id) && selection.editing) {
          this._editing = true;
        } else {
          this._editing = false;
        }
      })
    );

    this.disposables.addFromEvent(this, 'keydown', this._handleKeyDown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._hoverTimeout) {
      clearTimeout(this._hoverTimeout);
      this._hoverTimeout = null;
    }
  }

  get edgelessSlots() {
    return this.std.get(EdgelessLegacySlotIdentifier);
  }

  override firstUpdated() {
    const { _disposables } = this;
    const selection = this.gfx.selection;

    _disposables.add(
      this.edgelessSlots.elementResizeStart.subscribe(() => {
        if (selection.selectedElements.includes(this.model)) {
          this._isResizing = true;
        }
      })
    );

    _disposables.add(
      this.edgelessSlots.elementResizeEnd.subscribe(() => {
        this._isResizing = false;
      })
    );

    const observer = new MutationObserver(() => {
      const rect = this._noteContent?.getBoundingClientRect();
      if (!rect) return;
      const zoom = this.gfx.viewport.zoom;
      const scale = this.model.props.edgeless.scale ?? 1;
      this._noteFullHeight =
        rect.height / scale / zoom + 2 * EDGELESS_BLOCK_CHILD_PADDING;
    });
    if (this._noteContent) {
      observer.observe(this, { childList: true, subtree: true });
      _disposables.add(() => observer.disconnect());
    }
  }

  override updated(changedProperties: PropertyValues) {
    if (changedProperties.has('_editing') && this._editing) {
      this.std.getOptional(TelemetryProvider)?.track('EdgelessNoteEditing', {
        page: 'edgeless',
        segment: this.model.isPageBlock() ? 'page' : 'note',
      });
    }
  }

  override getRenderingRect() {
    const { xywh, edgeless } = this.model.props;
    const { collapse, scale = 1 } = edgeless;

    const bound = Bound.deserialize(xywh);
    const width = bound.w / scale;
    const height = bound.h / scale;

    return {
      x: bound.x,
      y: bound.y,
      w: width,
      h: collapse ? height : 'unset',
      zIndex: this.toZIndex(),
    };
  }

  override renderGfxBlock() {
    const { model } = this;
    const { displayMode } = model.props;
    if (!!displayMode && displayMode === NoteDisplayMode.DocOnly)
      return nothing;

    const { xywh, edgeless } = model.props;
    const { borderRadius } = edgeless.style;
    const { collapse = false, collapsedHeight, scale = 1 } = edgeless;

    const { tool } = this.gfx;

    const bound = Bound.deserialize(xywh);
    const height = bound.h / scale;

    const style = {
      borderRadius: borderRadius + 'px',
      transform: `scale(${scale})`,
    };

    const extra = this._editing ? ACTIVE_NOTE_EXTRA_PADDING : 0;

    const isCollapsable =
      collapse != null &&
      collapsedHeight != null &&
      collapsedHeight !== this._noteFullHeight;

    const isCollapseArrowUp = collapse
      ? this._noteFullHeight < height
      : !!collapsedHeight && collapsedHeight < height;

    const hasHeader = !!this.std.getOptional(NoteConfigExtension.identifier)
      ?.edgelessNoteHeader;

    return html`
      <div
        class=${styles.edgelessNoteContainer}
        style=${styleMap(style)}
        data-model-height="${bound.h}"
        data-editing=${this._editing}
        data-collapse=${ifDefined(collapse)}
        data-testid="edgeless-note-container"
        @mouseleave=${this._leaved}
        @mousemove=${this._hovered}
        data-scale="${scale}"
      >
        <edgeless-note-background
          .editing=${this._editing}
          .note=${this.model}
        ></edgeless-note-background>

        <div
          data-testid="edgeless-note-clip-container"
          class=${styles.clipContainer}
          style=${styleMap({
            'overflow-y': this._isShowCollapsedContent ? 'initial' : 'clip',
          })}
        >
          <div>
            <edgeless-page-block-title
              .note=${this.model}
            ></edgeless-page-block-title>
            <div
              contenteditable=${String(!this.store.readonly$.value)}
              class="edgeless-note-page-content"
            >
              ${this.renderPageContent()}
            </div>
          </div>
        </div>

        <edgeless-note-mask
          .model=${this.model}
          .host=${this.host}
          .zoom=${this.gfx.viewport.zoom ?? 1}
          .disableMask=${this.hideMask}
          .editing=${this._editing}
        ></edgeless-note-mask>

        ${isCollapsable &&
        tool.currentToolName$.value !== 'frameNavigator' &&
        (!this.model.isPageBlock() || !hasHeader)
          ? html`<div
              class="${classMap({
                [styles.collapseButton]: true,
                flip: isCollapseArrowUp,
              })}"
              style=${styleMap({
                bottom: this._editing ? `${-extra}px` : '0',
              })}
              data-testid="edgeless-note-collapse-button"
              @mousedown=${stopPropagation}
              @mouseup=${stopPropagation}
              @click=${this._setCollapse}
            >
              ${MoreIndicator}
            </div>`
          : nothing}
        ${this._collapsedContent()}
      </div>
    `;
  }

  override onBoxSelected(_: BoxSelectionContext) {
    return this.model.props.displayMode !== NoteDisplayMode.DocOnly;
  }

  @state()
  private accessor _editing = false;

  @state()
  private accessor _isHover = false;

  @state()
  private accessor _isResizing = false;

  @state()
  private accessor _noteFullHeight = 0;

  @state()
  accessor hideMask = false;

  @query(`.${styles.clipContainer} > div`)
  private accessor _noteContent: HTMLElement | null = null;

  @query('doc-title')
  private accessor _docTitle: DocTitle | null = null;
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_EDGELESS_NOTE]: EdgelessNoteBlockComponent;
  }
}

export const EdgelessNoteInteraction =
  GfxViewInteractionExtension<EdgelessNoteBlockComponent>(
    NoteBlockSchema.model.flavour,
    {
      resizeConstraint: {
        minWidth: 170 + 24 * 2,
        minHeight: 92,
      },
      handleRotate: () => {
        return {
          beforeRotate(context) {
            context.set({
              rotatable: false,
            });
          },
        };
      },
      handleResize: ({ model }) => {
        const initialScale: number = model.props.edgeless.scale ?? 1;
        return {
          onResizeStart(context): void {
            context.default(context);
            model.stash('edgeless');
          },

          onResizeMove(context): void {
            const { originalBound, newBound, lockRatio, constraint } = context;
            const { minWidth, minHeight, maxHeight, maxWidth } = constraint;

            let scale = initialScale;
            let edgelessProp = { ...model.props.edgeless };
            const originalRealWidth = originalBound.w / scale;

            if (lockRatio) {
              scale = newBound.w / originalRealWidth;
              edgelessProp.scale = scale;
            }

            newBound.w = clamp(newBound.w, minWidth * scale, maxWidth);
            newBound.h = clamp(newBound.h, minHeight * scale, maxHeight);

            if (newBound.h > minHeight * scale) {
              edgelessProp.collapse = true;
              edgelessProp.collapsedHeight = newBound.h / scale;
            }

            model.props.edgeless = edgelessProp;
            model.props.xywh = newBound.serialize();
          },

          onResizeEnd(context): void {
            context.default(context);
            model.pop('edgeless');
          },
        };
      },
      handleSelection: ({ std, gfx, view, model }) => {
        return {
          onSelect(context) {
            const { selected, multiSelect, event: e } = context;
            const { editing } = gfx.selection;
            const alreadySelected = gfx.selection.has(model.id);

            if (!multiSelect && selected && (alreadySelected || editing)) {
              if (model.isLocked()) return;

              if (alreadySelected && editing) {
                return;
              }

              gfx.selection.set({
                elements: [model.id],
                editing: true,
              });

              view.updateComplete
                .then(() => {
                  if (!view.isConnected) {
                    return;
                  }

                  if (model.children.length === 0) {
                    const blockId = std.store.addBlock(
                      'affine:paragraph',
                      { type: 'text' },
                      model.id
                    );

                    if (blockId) {
                      focusTextModel(std, blockId);
                    }
                  } else {
                    const rect = view
                      .querySelector('.affine-block-children-container')
                      ?.getBoundingClientRect();

                    if (rect) {
                      const offsetY = 8 * gfx.viewport.zoom;
                      const offsetX = 2 * gfx.viewport.zoom;
                      const x = clamp(
                        e.clientX,
                        rect.left + offsetX,
                        rect.right - offsetX
                      );
                      const y = clamp(
                        e.clientY,
                        rect.top + offsetY,
                        rect.bottom - offsetY
                      );
                      handleNativeRangeAtPoint(x, y);
                    } else {
                      handleNativeRangeAtPoint(e.clientX, e.clientY);
                    }
                  }
                })
                .catch(console.error);
            } else {
              context.default(context);
            }
          },
        };
      },
    }
  );
