import {
  CaptionedBlockComponent,
  SelectedStyle,
} from '@blocksuite/affine-components/caption';
import type { EmbedCardStyle, EmbedProps } from '@blocksuite/affine-model';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_MIN_WIDTH,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import {
  BlockElementCommentManager,
  DocModeProvider,
} from '@blocksuite/affine-shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { findAncestorModel } from '@blocksuite/affine-shared/utils';
import type { BlockService } from '@blocksuite/std';
import {
  GfxViewInteractionExtension,
  type ResizeConstraint,
} from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';
import { computed, type ReadonlySignal, signal } from '@preact/signals-core';
import type { TemplateResult } from 'lit';
import { html } from 'lit';
import { query } from 'lit/decorators.js';
import { type ClassInfo, classMap } from 'lit/directives/class-map.js';
import { type StyleInfo, styleMap } from 'lit/directives/style-map.js';

export class EmbedBlockComponent<
  Model extends BlockModel<EmbedProps> = BlockModel<EmbedProps>,
  Service extends BlockService = BlockService,
  WidgetName extends string = string,
> extends CaptionedBlockComponent<Model, Service, WidgetName> {
  selectedStyle$: ReadonlySignal<ClassInfo> | null = computed<ClassInfo>(
    () => ({
      'selected-style': this.selected$.value,
    })
  );

  readonly isDraggingOnHost$ = signal(false);
  readonly isResizing$ = signal(false);
  // show overlay to prevent the iframe from capturing pointer events
  // when the block is dragging, resizing, or not selected
  readonly showOverlay$ = computed(
    () =>
      this.isDraggingOnHost$.value ||
      this.isResizing$.value ||
      !this.selected$.value
  );

  private _fetchAbortController = new AbortController();

  _cardStyle: EmbedCardStyle = 'horizontal';

  blockDraggable = true;

  /**
   * The style of the embed card.
   * You can use this to change the height and width of the card.
   * By default, the height and width are set to `_cardHeight` and `_cardWidth` respectively.
   */
  protected embedContainerStyle: StyleInfo = {};

  get isCommentHighlighted() {
    return (
      this.std
        .getOptional(BlockElementCommentManager)
        ?.isBlockCommentHighlighted(this.model) ?? false
    );
  }

  renderEmbed = (content: () => TemplateResult) => {
    if (
      this._cardStyle === 'horizontal' ||
      this._cardStyle === 'horizontalThin' ||
      this._cardStyle === 'list'
    ) {
      this.style.display = 'block';

      const insideNote = findAncestorModel(
        this.model,
        m => m.flavour === 'affine:note'
      );

      if (
        !insideNote &&
        this.std.get(DocModeProvider).getEditorMode() === 'edgeless'
      ) {
        this.style.minWidth = `${EMBED_CARD_MIN_WIDTH}px`;
      }
    }

    return html`
      <div
        draggable="${this.blockDraggable ? 'true' : 'false'}"
        class=${classMap({
          'embed-block-container': true,
          ...this.selectedStyle$?.value,
        })}
        style=${styleMap({
          height: `${this._cardHeight}px`,
          width: '100%',
          ...(this.isCommentHighlighted
            ? {
                border: `2px solid ${unsafeCSSVarV2('block/comment/highlightUnderline')}`,
              }
            : {}),
          ...this.embedContainerStyle,
        })}
      >
        ${content()}
      </div>
    `;
  };

  /**
   * The height of the current embed card. Changes based on the card style.
   */
  get _cardHeight() {
    return EMBED_CARD_HEIGHT[this._cardStyle];
  }

  /**
   * The width of the current embed card. Changes based on the card style.
   */
  get _cardWidth() {
    return EMBED_CARD_WIDTH[this._cardStyle];
  }

  get fetchAbortController() {
    return this._fetchAbortController;
  }

  override connectedCallback() {
    super.connectedCallback();

    if (this._fetchAbortController.signal.aborted)
      this._fetchAbortController = new AbortController();

    this.contentEditable = 'false';

    // subscribe the editor host global dragging event
    // to show the overlay for the dragging area or other pointer events
    this.handleEvent(
      'dragStart',
      () => {
        this.isDraggingOnHost$.value = true;
      },
      { global: true }
    );

    this.handleEvent(
      'dragEnd',
      () => {
        this.isDraggingOnHost$.value = false;
      },
      { global: true }
    );
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._fetchAbortController.abort();
  }

  protected override accessor blockContainerStyles: StyleInfo | undefined = {
    margin: '18px 0',
  };

  @query('.embed-block-container')
  protected accessor embedBlock!: HTMLDivElement;

  override accessor selectedStyle = SelectedStyle.Border;

  override accessor useCaptionEditor = true;

  override accessor useZeroWidth = true;
}

export const createEmbedEdgelessBlockInteraction = (
  flavour: string,
  config?: {
    resizeConstraint?: ResizeConstraint;
  }
) => {
  const resizeConstraint = Object.assign(
    {
      lockRatio: true,
    },
    config?.resizeConstraint ?? {}
  );
  const rotateConstraint = {
    rotatable: false,
  };

  return GfxViewInteractionExtension(flavour, {
    resizeConstraint,
    handleRotate() {
      return {
        beforeRotate(context) {
          context.set(rotateConstraint);
        },
      };
    },
  });
};
