import type { ResolvedStateInfo } from '@blocksuite/affine-components/resource';
import {
  focusBlockEnd,
  focusBlockStart,
  getNextBlockCommand,
  getPrevBlockCommand,
} from '@blocksuite/affine-shared/commands';
import { ImageSelection } from '@blocksuite/affine-shared/selection';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import type { BlockComponent, UIEventStateContext } from '@blocksuite/std';
import {
  BlockSelection,
  ShadowlessElement,
  TextSelection,
} from '@blocksuite/std';
import type { BaseSelection } from '@blocksuite/store';
import { computed } from '@preact/signals-core';
import { css, html, type PropertyValues } from 'lit';
import { property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { when } from 'lit/directives/when.js';

import type { ImageBlockComponent } from '../image-block';
import { ImageResizeManager } from '../image-resize-manager';
import { shouldResizeImage } from '../utils';
import { ImageSelectedRect } from './image-selected-rect';

export class ImageBlockPageComponent extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    affine-page-image {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 0;
      cursor: pointer;
    }

    affine-page-image .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      top: 4px;
      left: 4px;
      width: 36px;
      height: 36px;
      padding: 5px;
      border-radius: 8px;
      background: ${unsafeCSSVarV2(
        'loading/imageLoadingBackground',
        '#92929238'
      )};

      & > svg {
        font-size: 25.71px;
      }
    }

    affine-page-image .affine-image-status {
      position: absolute;
      left: 18px;
      bottom: 18px;
    }

    affine-page-image .resizable-img {
      position: relative;
      max-width: 100%;
    }

    affine-page-image .resizable-img img {
      width: 100%;
      height: 100%;
    }

    affine-page-image .comment-highlighted {
      outline: 2px solid ${unsafeCSSVarV2('block/comment/highlightUnderline')};
    }
  `;

  resizeable$ = computed(() => this.block.resizeable$.value);

  private _isDragging = false;

  private get _doc() {
    return this.block.store;
  }

  private get _host() {
    return this.block.host;
  }

  private get _model() {
    return this.block.model;
  }

  private _bindKeyMap() {
    const selection = this._host.selection;

    const addParagraph = (ctx: UIEventStateContext) => {
      const parent = this._doc.getParent(this._model);
      if (!parent) return;

      const index = parent.children.indexOf(this._model);
      const blockId = this._doc.addBlock(
        'affine:paragraph',
        {},
        parent,
        index + 1
      );

      const event = ctx.get('defaultState').event;
      event.preventDefault();

      selection.update(selList =>
        selList
          .filter<BaseSelection>(sel => !sel.is(ImageSelection))
          .concat(
            selection.create(TextSelection, {
              from: {
                blockId,
                index: 0,
                length: 0,
              },
              to: null,
            })
          )
      );
    };

    // TODO: use key map extension
    this.block.bindHotKey({
      Escape: () => {
        selection.update(selList => {
          return selList.map(sel => {
            const current =
              sel.is(ImageSelection) && sel.blockId === this.block.blockId;
            if (current) {
              return selection.create(BlockSelection, {
                blockId: this.block.blockId,
              });
            }
            return sel;
          });
        });
        return true;
      },
      Delete: ctx => {
        if (this._host.store.readonly || !this.resizeable$.peek()) return;

        addParagraph(ctx);
        this._doc.deleteBlock(this._model);
        return true;
      },
      Backspace: ctx => {
        if (this._host.store.readonly || !this.resizeable$.peek()) return;

        addParagraph(ctx);
        this._doc.deleteBlock(this._model);
        return true;
      },
      Enter: ctx => {
        if (this._host.store.readonly || !this.resizeable$.peek()) return;

        addParagraph(ctx);
        return true;
      },
      ArrowDown: ctx => {
        const std = this._host.std;

        // If the selection is not image selection, we should not handle it.
        if (!std.selection.find(ImageSelection)) {
          return false;
        }

        const event = ctx.get('keyboardState');
        event.raw.preventDefault();

        std.command
          .chain()
          .pipe(getNextBlockCommand, { path: this.block.blockId })
          .pipe<{ focusBlock: BlockComponent }>((ctx, next) => {
            const { nextBlock } = ctx;
            if (!nextBlock) return;

            return next({ focusBlock: nextBlock });
          })
          .pipe(focusBlockStart)
          .run();
        return true;
      },
      ArrowUp: ctx => {
        const std = this._host.std;

        // If the selection is not image selection, we should not handle it.

        if (!std.selection.find(ImageSelection)) {
          return false;
        }

        const event = ctx.get('keyboardState');
        event.raw.preventDefault();

        std.command
          .chain()
          .pipe(getPrevBlockCommand, { path: this.block.blockId })
          .pipe<{ focusBlock: BlockComponent }>((ctx, next) => {
            const { prevBlock } = ctx;
            if (!prevBlock) return;

            return next({ focusBlock: prevBlock });
          })
          .pipe(focusBlockEnd)
          .run();
        return true;
      },
    });
  }

  private _handleError() {
    this.block.resourceController.updateState({
      errorMessage: 'Failed to download image!',
    });
  }

  private _handleSelection() {
    const selection = this._host.selection;

    this._disposables.addFromEvent(
      this.resizeImg,
      'click',
      (event: MouseEvent) => {
        // the peek view need handle shift + click
        if (event.shiftKey) return;

        event.stopPropagation();
        selection.update(selList => {
          return selList
            .filter(sel => !['block', 'image', 'text'].includes(sel.type))
            .concat(
              selection.create(ImageSelection, { blockId: this.block.blockId })
            );
        });
        return true;
      }
    );

    this.block.handleEvent(
      'click',
      () => {
        if (!this.resizeable$.peek()) return;

        selection.update(selList =>
          selList.filter(
            sel =>
              !(sel.is(ImageSelection) && sel.blockId === this.block.blockId)
          )
        );
      },
      {
        global: true,
      }
    );
  }

  private _normalizeImageSize() {
    // If is dragging, we should use the real size of the image
    if (this._isDragging && this.resizeImg) {
      return {
        width: this.resizeImg.style.width,
      };
    }

    const { width, height } = this._model.props;
    if (!width || !height) {
      return {
        width: 'unset',
        height: 'unset',
      };
    }

    return {
      width: `${width}px`,
    };
  }

  private _observeDrag() {
    const imageResizeManager = new ImageResizeManager();

    this._disposables.add(
      this._host.event.add('dragStart', ctx => {
        const pointerState = ctx.get('pointerState');
        const target = pointerState.event.target;
        if (shouldResizeImage(this, target)) {
          this._isDragging = true;
          imageResizeManager.onStart(pointerState);
          return true;
        }
        return false;
      })
    );

    this._disposables.add(
      this._host.event.add('dragMove', ctx => {
        const pointerState = ctx.get('pointerState');
        if (this._isDragging) {
          imageResizeManager.onMove(pointerState);
          return true;
        }
        return false;
      })
    );

    this._disposables.add(
      this._host.event.add('dragEnd', () => {
        if (this._isDragging) {
          this._isDragging = false;
          imageResizeManager.onEnd();
          return true;
        }
        return false;
      })
    );
  }

  override connectedCallback() {
    super.connectedCallback();

    this._bindKeyMap();

    this._observeDrag();
  }

  override firstUpdated(changedProperties: PropertyValues) {
    super.firstUpdated(changedProperties);

    this._handleSelection();

    // The embed block can not be focused,
    // so the active element will be the last activated element.
    // If the active element is the title textarea,
    // any event will dispatch from it and be ignored. (Most events will ignore title)
    // so we need to blur it.
    // See also https://developer.mozilla.org/en-US/docs/Web/API/Document/activeElement
    this.addEventListener('click', () => {
      if (
        document.activeElement &&
        document.activeElement instanceof HTMLElement
      ) {
        document.activeElement.blur();
      }
    });
  }

  override render() {
    const imageSize = this._normalizeImageSize();

    const imageSelectedRect = this.resizeable$.value
      ? ImageSelectedRect(this._doc.readonly)
      : null;

    const blobUrl = this.block.blobUrl;
    const caption = this.block.model.props.caption$.value ?? 'Image';
    const { loading, error, icon, description, needUpload } = this.state;

    return html`
      <div
        class=${classMap({
          'resizable-img': true,
          'comment-highlighted': this.block.isCommentHighlighted,
        })}
        style=${styleMap(imageSize)}
      >
        <img
          class="drag-target"
          draggable="false"
          loading="lazy"
          src=${blobUrl}
          alt=${caption}
          @error=${this._handleError}
        />

        ${imageSelectedRect}
      </div>

      ${when(loading, () => html`<div class="loading">${icon}</div>`)}
      ${when(
        Boolean(error && description),
        () =>
          html`<affine-resource-status
            class="affine-image-status"
            .message=${description}
            .needUpload=${needUpload}
            .action=${() =>
              needUpload
                ? this.block.resourceController.upload()
                : this.block.refreshData()}
          ></affine-resource-status>`
      )}
    `;
  }

  @property({ attribute: false })
  accessor block!: ImageBlockComponent;

  @property({ attribute: false })
  accessor state!: ResolvedStateInfo;

  @query('.resizable-img')
  accessor resizeImg!: HTMLElement;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-page-image': ImageBlockPageComponent;
  }
}
