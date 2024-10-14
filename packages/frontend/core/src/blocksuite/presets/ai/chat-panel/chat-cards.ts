import type { EditorHost } from '@blocksuite/affine/block-std';
import {
  type ImageBlockModel,
  isInsideEdgelessEditor,
  type NoteBlockModel,
  NoteDisplayMode,
} from '@blocksuite/affine/blocks';
import { WithDisposable } from '@blocksuite/affine/global/utils';
import type { BlockModel } from '@blocksuite/affine/store';
import {
  css,
  html,
  LitElement,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import {
  CurrentSelectionIcon,
  DocIcon,
  SmallImageIcon,
} from '../_common/icons';
import { type AIChatParams, AIProvider } from '../provider';
import {
  getSelectedImagesAsBlobs,
  getSelectedTextContent,
  getTextContentFromBlockModels,
  selectedToCanvas,
} from '../utils/selection-utils';
import type { ChatContextValue } from './chat-context';

const cardsStyles = css`
  .card-wrapper {
    width: 90%;
    max-height: 76px;
    border-radius: 8px;
    border: 1px solid var(--affine-border-color);
    padding: 4px 12px;
    cursor: pointer;

    .card-title {
      display: flex;
      gap: 4px;
      height: 22px;
      margin-bottom: 2px;
      font-weight: 500;
      font-size: 14px;
      color: var(--affine-text-primary-color);
    }

    .second-text {
      font-size: 14px;
      font-weight: 400;
      color: var(--affine-text-secondary-color);
    }
  }
`;

enum CardType {
  Text,
  Image,
  Block,
  Doc,
}

type CardBase = {
  id: number;
};

type CardText = CardBase & {
  type: CardType.Text;
  text: string;
  markdown: string;
};

type CardImage = CardBase & {
  type: CardType.Image;
  image: File;
  caption?: string;
};

type CardBlock = CardBase & {
  type: CardType.Block | CardType.Doc;
  text?: string;
  markdown?: string;
  images?: File[];
};

type Card = CardText | CardImage | CardBlock;

const MAX_CARDS = 3;

export class ChatCards extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      display: none;
      flex-direction: column;
      gap: 12px;
    }

    :host([data-show]) {
      display: flex;
    }

    ${cardsStyles}
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<ChatContextValue>) => void;

  @property({ attribute: false })
  accessor temporaryParams: AIChatParams | null = null;

  @property({ attribute: false })
  accessor isEmpty!: boolean;

  @state()
  accessor cards: Card[] = [];

  private _currentDocId: string | null = null;
  private _selectedCardId: number = 0;

  static renderText({ text }: CardText) {
    const lines = text.split('\n');

    return html`
      <div class="card-wrapper">
        <div class="card-title">
          ${CurrentSelectionIcon}
          <div>Start with current selection</div>
        </div>
        <div class="second-text">
          ${repeat(
            lines.slice(0, 2),
            line => line,
            line => html`
              <div
                style=${styleMap({
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                })}
              >
                ${line}
              </div>
            `
          )}
        </div>
      </div>
    `;
  }

  static renderImage({ caption, image }: CardImage) {
    return html`
      <div
        class="card-wrapper"
        style=${styleMap({
          display: 'flex',
          gap: '8px',
          justifyContent: 'space-between',
        })}
      >
        <div
          style=${styleMap({
            display: 'flex',
            flexDirection: 'column',
            maxWidth: 'calc(100% - 72px)',
          })}
        >
          <div class="card-title">
            ${SmallImageIcon}
            <div>Start with this Image</div>
          </div>
          <div class="second-text">${caption ? caption : 'caption'}</div>
        </div>
        <img
          style=${styleMap({
            maxWidth: '72px',
            maxHeight: '46px',
          })}
          src="${URL.createObjectURL(image)}"
        />
      </div>
    `;
  }

  static renderDoc({ text, images }: CardBlock) {
    let textTpl = html`you've chosen within the doc`;
    let imageTpl: TemplateResult<1> | typeof nothing = nothing;
    let hasImage = false;

    if (text?.length) {
      const lines = text.split('\n');
      textTpl = html`${repeat(
        lines.slice(0, 2),
        line => line,
        line => html`
          <div
            style=${styleMap({
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            })}
          >
            ${line}
          </div>
        `
      )}`;
    }

    if (images?.length) {
      hasImage = true;
      imageTpl = html`
        <img
          style=${styleMap({
            maxWidth: '72px',
            maxHeight: '46px',
          })}
          src="${URL.createObjectURL(images[0])}"
        />
      `;
    }

    return html`
      <div
        class="card-wrapper"
        style=${styleMap({
          display: 'flex',
          gap: '8px',
          justifyContent: 'space-between',
        })}
      >
        <div
          style=${styleMap({
            display: 'flex',
            flexDirection: 'column',
            maxWidth: hasImage ? 'calc(100% - 72px)' : '100%',
          })}
        >
          <div class="card-title">
            ${DocIcon}
            <div>Start with this doc</div>
          </div>
          <div class="second-text">${textTpl}</div>
        </div>
        ${imageTpl}
      </div>
    `;
  }

  private _renderCard(card: Card) {
    if (card.type === CardType.Text) {
      return ChatCards.renderText(card);
    }

    if (card.type === CardType.Image) {
      return ChatCards.renderImage(card);
    }

    if (card.type === CardType.Doc) {
      return ChatCards.renderDoc(card);
    }

    return nothing;
  }

  private _updateCards(card: Card) {
    this.cards.unshift(card);

    if (this.cards.length > MAX_CARDS) {
      this.cards.pop();
    }

    this.requestUpdate();
  }

  private async _handleDocSelection(card: CardBlock) {
    const { text, markdown, images } = await this._extractAll();

    card.text = text;
    card.markdown = markdown;
    card.images = images;
  }

  private async _selectCard(card: Card) {
    AIProvider.slots.toggleChatCards.emit({ visible: false });

    this._selectedCardId = card.id;

    switch (card.type) {
      case CardType.Text: {
        this.updateContext({
          quote: card.text,
          markdown: card.markdown,
        });
        break;
      }
      case CardType.Image: {
        this.updateContext({
          images: [card.image],
        });
        break;
      }
      case CardType.Block: {
        this.updateContext({
          quote: card.text,
          markdown: card.markdown,
          images: card.images,
        });
        break;
      }

      case CardType.Doc: {
        await this._handleDocSelection(card);
        this.updateContext({
          quote: card.text,
          markdown: card.markdown,
          images: card.images,
        });
        break;
      }
    }
  }

  private async _extract() {
    const text = await getSelectedTextContent(this.host, 'plain-text');
    const images = await getSelectedImagesAsBlobs(this.host);
    const hasText = text.length > 0;
    const hasImages = images.length > 0;

    if (hasText && !hasImages) {
      const markdown = await getSelectedTextContent(this.host, 'markdown');

      this._updateCards({
        id: Date.now(),
        type: CardType.Text,
        text,
        markdown,
      });
    } else if (!hasText && hasImages && images.length === 1) {
      const [_, data] = this.host.command
        .chain()
        .tryAll(chain => [chain.getImageSelections()])
        .getSelectedBlocks({
          types: ['image'],
        })
        .run();
      let caption = '';

      if (data.currentImageSelections?.[0]) {
        caption =
          (
            this.host.doc.getBlock(data.currentImageSelections[0].blockId)
              ?.model as ImageBlockModel
          )?.caption ?? '';
      }

      this._updateCards({
        id: Date.now(),
        type: CardType.Image,
        image: images[0],
        caption,
      });
    } else {
      const markdown =
        (await getSelectedTextContent(this.host, 'markdown')).trim() || '';
      this._updateCards({
        id: Date.now(),
        type: CardType.Block,
        text,
        markdown,
        images,
      });
    }
  }

  private async _extractOnEdgeless(host: EditorHost) {
    if (!isInsideEdgelessEditor(host)) return;

    const canvas = await selectedToCanvas(host);
    if (!canvas) return;

    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(resolve)
    );
    if (!blob) return;

    this._updateCards({
      id: Date.now(),
      type: CardType.Image,
      image: new File([blob], 'selected.png'),
    });
  }

  private async _extractAll() {
    const notes = this.host.doc
      .getBlocksByFlavour('affine:note')
      .filter(
        note =>
          (note.model as NoteBlockModel).displayMode !==
          NoteDisplayMode.EdgelessOnly
      )
      .map(note => note.model as NoteBlockModel);
    const selectedModels = notes.reduce((acc, note) => {
      acc.push(...note.children);
      return acc;
    }, [] as BlockModel[]);
    const text = await getTextContentFromBlockModels(
      this.host,
      selectedModels,
      'plain-text'
    );
    const markdown = await getTextContentFromBlockModels(
      this.host,
      selectedModels,
      'markdown'
    );
    const blobs = await Promise.all(
      selectedModels.map(async s => {
        if (s.flavour !== 'affine:image') return null;
        const sourceId = (s as ImageBlockModel)?.sourceId;
        if (!sourceId) return null;
        const blob = await (sourceId
          ? this.host.doc.blobSync.get(sourceId)
          : null);
        if (!blob) return null;
        return new File([blob], sourceId);
      }) ?? []
    );
    const images = blobs.filter((blob): blob is File => !!blob);

    return {
      text,
      markdown,
      images,
    };
  }

  private async _appendCardWithParams({
    host,
    mode,
    autoSelect,
  }: AIChatParams) {
    if (mode === 'edgeless') {
      await this._extractOnEdgeless(host);
    } else {
      await this._extract();
    }

    if (!autoSelect) {
      return;
    }

    if (this.cards.length > 0) {
      const card = this.cards[0];
      if (card.type === CardType.Doc) return;

      await this._selectCard(card);
    }
  }

  protected override async willUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has('temporaryParams') && this.temporaryParams) {
      const params = this.temporaryParams;
      await this._appendCardWithParams(params);
      this.temporaryParams = null;
    }

    if (changedProperties.has('host')) {
      if (this._currentDocId === this.host.doc.id) return;
      this._currentDocId = this.host.doc.id;
      this.cards = [];

      const { text, images } = await this._extractAll();
      const hasText = text.length > 0;
      const hasImages = images.length > 0;

      // Currently only supports checking on first load
      if (hasText || hasImages) {
        const card: CardBlock = {
          id: Date.now(),
          type: CardType.Doc,
        };
        if (hasText) {
          card.text = text;
        }
        if (hasImages) {
          card.images = images;
        }

        this.cards.push(card);
        this.requestUpdate();
      }
    }
  }

  override connectedCallback() {
    super.connectedCallback();

    this._disposables.add(
      AIProvider.slots.requestOpenWithChat.on(async params => {
        await this._appendCardWithParams(params);
      })
    );

    this._disposables.add(
      AIProvider.slots.toggleChatCards.on(({ visible, ok }) => {
        if (visible && ok && this._selectedCardId > 0) {
          this.cards = this.cards.filter(
            card => card.id !== this._selectedCardId
          );
          this._selectedCardId = 0;
        }
      })
    );
  }

  protected override render() {
    if (!this.isEmpty) return nothing;

    return repeat(
      this.cards,
      card => card.id,
      card => html`
        <div @click=${() => this._selectCard(card)}>
          ${this._renderCard(card)}
        </div>
      `
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-cards': ChatCards;
  }
}
