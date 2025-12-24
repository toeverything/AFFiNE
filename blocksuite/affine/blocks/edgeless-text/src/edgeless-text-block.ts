import { TextUtils } from '@blocksuite/affine-block-surface';
import { formatBlockCommand } from '@blocksuite/affine-inline-preset';
import {
  DefaultTheme,
  EDGELESS_TEXT_BLOCK_MIN_HEIGHT,
  EDGELESS_TEXT_BLOCK_MIN_WIDTH,
  type EdgelessTextBlockModel,
  EdgelessTextBlockSchema,
  ListBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import {
  handleNativeRangeAtPoint,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import { Bound, clamp } from '@blocksuite/global/gfx';
import type { BlockComponent } from '@blocksuite/std';
import {
  BlockSelection,
  GfxBlockComponent,
  TextSelection,
} from '@blocksuite/std';
import { GfxViewInteractionExtension } from '@blocksuite/std/gfx';
import { computed } from '@preact/signals-core';
import { css, html } from 'lit';
import { query, state } from 'lit/decorators.js';
import { type StyleInfo, styleMap } from 'lit/directives/style-map.js';

export class EdgelessTextBlockComponent extends GfxBlockComponent<EdgelessTextBlockModel> {
  static override styles = css`
    .edgeless-text-block-container[data-max-width='false'] .inline-editor span {
      word-break: keep-all !important;
      text-wrap: nowrap !important;
    }

    .edgeless-text-block-container affine-paragraph,
    affine-list {
      color: var(--edgeless-text-color);
      font-family: var(--edgeless-text-font-family);
      font-style: var(--edgeless-text-font-style);
      font-weight: var(--edgeless-text-font-weight);
      text-align: var(--edgeless-text-text-align);
    }
  `;

  private readonly _resizeObserver = new ResizeObserver(() => {
    if (this.store.readonly) {
      return;
    }

    if (!this.model.props.hasMaxWidth) {
      this._updateW();
    }

    this._updateH();
  });

  private _updateH() {
    const bound = Bound.deserialize(this.model.xywh);
    const rect = this._textContainer.getBoundingClientRect();
    bound.h = rect.height / this.gfx.viewport.zoom;

    this.store.updateBlock(this.model, {
      xywh: bound.serialize(),
    });
  }

  private _updateW() {
    const bound = Bound.deserialize(this.model.xywh);
    const rect = this._textContainer.getBoundingClientRect();
    bound.w = Math.max(
      rect.width / this.gfx.viewport.zoom,
      EDGELESS_TEXT_BLOCK_MIN_WIDTH * this.gfx.viewport.zoom
    );

    this.store.updateBlock(this.model, {
      xywh: bound.serialize(),
    });
  }

  private readonly _style$ = computed(() => {
    const {
      color$: { value: color },
      fontFamily$: { value: fontFamily },
      fontStyle$: { value: fontStyle },
      fontWeight$: { value: fontWeight },
      textAlign$: { value: textAlign },
    } = this.model.props;
    return {
      color,
      fontFamily,
      fontStyle,
      fontWeight,
      textAlign,
    };
  });

  checkWidthOverflow(width: number) {
    let wValid = true;

    const oldWidthStr = this._textContainer.style.width;
    this._textContainer.style.width = `${width}px`;
    if (
      this.childrenContainer.scrollWidth > this.childrenContainer.offsetWidth
    ) {
      wValid = false;
    }
    this._textContainer.style.width = oldWidthStr;

    return wValid;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.disposables.add(
      this.model.propsUpdated.subscribe(({ key }) => {
        this.updateComplete
          .then(() => {
            const command = this.std.command;
            const blockSelections = this.model.children.map(child =>
              this.std.selection.create(BlockSelection, {
                blockId: child.id,
              })
            );

            if (key === 'fontStyle') {
              command.exec(formatBlockCommand, {
                blockSelections,
                styles: {
                  italic: null,
                },
              });
            } else if (key === 'color') {
              command.exec(formatBlockCommand, {
                blockSelections,
                styles: {
                  color: null,
                },
              });
            } else if (key === 'fontWeight') {
              command.exec(formatBlockCommand, {
                blockSelections,
                styles: {
                  bold: null,
                },
              });
            }
          })
          .catch(console.error);
      })
    );
  }

  override firstUpdated(props: Map<string, unknown>) {
    super.firstUpdated(props);

    const { disposables, std } = this;
    const edgelessSelection = this.gfx.selection;

    disposables.add(
      edgelessSelection.slots.updated.subscribe(() => {
        if (edgelessSelection.has(this.model.id) && edgelessSelection.editing) {
          this._editing = true;
        } else {
          this._editing = false;
        }
      })
    );

    this._resizeObserver.observe(this._textContainer);
    disposables.add(() => {
      this._resizeObserver.disconnect();
    });

    disposables.addFromEvent(this._textContainer, 'click', e => {
      if (!this._editing) return;

      const containerRect = this._textContainer.getBoundingClientRect();
      const isTop = e.clientY < containerRect.top + containerRect.height / 2;

      let newParagraphId: string | null = null;
      if (isTop) {
        const firstChild = this.model.firstChild();
        if (
          !firstChild ||
          !matchModels(firstChild, [ListBlockModel, ParagraphBlockModel])
        ) {
          newParagraphId = this.store.addBlock(
            'affine:paragraph',
            {},
            this.model.id,
            0
          );
        }
      } else {
        const lastChild = this.model.lastChild();
        if (
          !lastChild ||
          !matchModels(lastChild, [ListBlockModel, ParagraphBlockModel])
        ) {
          newParagraphId = this.store.addBlock(
            'affine:paragraph',
            {},
            this.model.id
          );
        }
      }

      if (newParagraphId) {
        std.selection.setGroup('note', [
          std.selection.create(TextSelection, {
            from: {
              blockId: newParagraphId,
              index: 0,
              length: 0,
            },
            to: null,
          }),
        ]);
      }
    });

    disposables.addFromEvent(this._textContainer, 'focusout', () => {
      if (!this._editing) return;

      this.std.selection.clear();
    });

    let composingWidth = EDGELESS_TEXT_BLOCK_MIN_WIDTH;
    disposables.addFromEvent(this, 'compositionupdate', () => {
      composingWidth = Math.max(
        this._textContainer.offsetWidth,
        EDGELESS_TEXT_BLOCK_MIN_HEIGHT
      );
    });
    disposables.addFromEvent(this, 'compositionend', () => {
      if (this.model.props.hasMaxWidth) {
        composingWidth = EDGELESS_TEXT_BLOCK_MIN_WIDTH;
        return;
      }
      // when IME finish container will crash to a small width, so
      // we set a max width to prevent this
      this._textContainer.style.width = `${composingWidth}px`;
      this.model.props.hasMaxWidth = true;
      requestAnimationFrame(() => {
        this._textContainer.style.width = '';
      });
    });
  }

  override getCSSTransform(): string {
    const viewport = this.gfx.viewport;
    const { translateX, translateY, zoom } = viewport;
    const bound = Bound.deserialize(this.model.xywh);

    const scaledX = bound.x * zoom;
    const scaledY = bound.y * zoom;
    const deltaX = scaledX - bound.x;
    const deltaY = scaledY - bound.y;

    return `translate(${translateX + deltaX}px, ${translateY + deltaY}px) scale(${zoom * this.model.props.scale})`;
  }

  override getRenderingRect() {
    const { xywh, scale, rotate, hasMaxWidth } = this.model.props;
    const bound = Bound.deserialize(xywh);
    const w = hasMaxWidth ? bound.w / scale : undefined;

    return {
      x: bound.x,
      y: bound.y,
      w,
      h: bound.h / scale,
      rotate,
      zIndex: this.toZIndex(),
    };
  }

  override renderGfxBlock() {
    const { model } = this;
    const { rotate, hasMaxWidth } = model.props;
    const editing = this._editing;
    const containerStyle: StyleInfo = {
      transform: `rotate(${rotate}deg)`,
      transformOrigin: 'center',
      border: `1px solid ${editing ? 'var(--affine—primary—color, #1e96eb)' : 'transparent'}`,
      borderRadius: '4px',
      boxSizing: 'border-box',
      boxShadow: editing ? '0px 0px 0px 2px rgba(30, 150, 235, 0.3)' : 'none',
      fontWeight: '400',
      lineHeight: 'var(--affine-line-height)',
      minWidth: !hasMaxWidth ? '220px' : undefined,
    };

    this.contentEditable = String(editing && !this.store.readonly$.value);

    return html`
      <div
        class="edgeless-text-block-container"
        data-max-width="${hasMaxWidth}"
        style=${styleMap(containerStyle)}
      >
        <div
          style=${styleMap({
            pointerEvents: editing ? 'auto' : 'none',
            userSelect: editing ? 'auto' : 'none',
          })}
        >
          ${this.renderPageContent()}
        </div>
      </div>
    `;
  }

  override renderPageContent() {
    const { color, fontFamily, fontStyle, fontWeight, textAlign } =
      this._style$.value;
    const themeProvider = this.std.get(ThemeProvider);
    const textColor = themeProvider.generateColorProperty(
      color,
      DefaultTheme.textColor,
      themeProvider.theme$.value
    );

    const style = styleMap({
      '--edgeless-text-color': textColor,
      '--edgeless-text-font-family': TextUtils.wrapFontFamily(fontFamily),
      '--edgeless-text-font-style': fontStyle,
      '--edgeless-text-font-weight': fontWeight,
      '--edgeless-text-text-align': textAlign,
      '--affine-list-margin': '0',
      '--affine-paragraph-margin': '0',
    });

    return html`
      <div style=${style} class="affine-block-children-container">
        ${this.renderChildren(this.model)}
      </div>
    `;
  }

  tryFocusEnd() {
    const paragraphOrLists = Array.from(
      this.querySelectorAll<BlockComponent>('affine-paragraph, affine-list')
    );
    const last = paragraphOrLists.at(-1);
    if (last) {
      this.host.selection.setGroup('note', [
        this.host.selection.create(TextSelection, {
          from: {
            blockId: last.blockId,
            index: last.model.text?.length ?? 0,
            length: 0,
          },
          to: null,
        }),
      ]);
    }
  }

  @state()
  private accessor _editing = false;

  @query('.edgeless-text-block-container')
  private accessor _textContainer!: HTMLDivElement;

  @query('.affine-block-children-container')
  accessor childrenContainer!: HTMLDivElement;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-edgeless-text': EdgelessTextBlockComponent;
  }
}

export const EdgelessTextInteraction =
  GfxViewInteractionExtension<EdgelessTextBlockComponent>(
    EdgelessTextBlockSchema.model.flavour,
    {
      resizeConstraint: {
        lockRatio: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        allowedHandlers: [
          'top-left',
          'top-right',
          'left',
          'right',
          'bottom-left',
          'bottom-right',
        ],
        minWidth: EDGELESS_TEXT_BLOCK_MIN_WIDTH,
      },
      handleResize: context => {
        const { model, view } = context;
        const initialScale = model.props.scale;

        return {
          onResizeStart(context) {
            context.default(context);
            model.stash('scale');
            model.stash('hasMaxWidth');
          },
          onResizeMove(context) {
            const { originalBound, newBound, constraint, lockRatio } = context;

            if (lockRatio) {
              const originalRealWidth = originalBound.w / initialScale;
              const newScale = newBound.w / originalRealWidth;

              model.props.scale = newScale;
              model.props.xywh = newBound.serialize();
            } else {
              if (!view.checkWidthOverflow(newBound.w)) {
                return;
              }

              const newRealWidth = clamp(
                newBound.w / initialScale,
                constraint.minWidth,
                constraint.maxWidth
              );

              const curBound = Bound.deserialize(model.xywh);

              model.props.xywh = Bound.serialize({
                ...newBound,
                w: newRealWidth * initialScale,
                h: curBound.h,
              });
              model.props.hasMaxWidth = true;
            }
          },
          onResizeEnd(context) {
            context.default(context);
            model.pop('scale');
            model.pop('hasMaxWidth');
          },
        };
      },

      handleSelection: context => {
        const { gfx, std, view, model } = context;
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
              return context.default(context);
            }
          },
        };
      },
    }
  );
