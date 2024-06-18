import type { BaseSelection, EditorHost } from '@blocksuite/block-std';
import { WithDisposable } from '@blocksuite/block-std';
import {
  type CopilotSelectionController,
  type ImageBlockModel,
  type NoteBlockModel,
  NoteDisplayMode,
} from '@blocksuite/blocks';
import { debounce } from '@blocksuite/global/utils';
import type { BlockModel } from '@blocksuite/store';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import {
  CurrentSelectionIcon,
  DocIcon,
  SmallImageIcon,
} from '../_common/icons.js';
import {
  getEdgelessRootFromEditor,
  getSelectedImagesAsBlobs,
  getSelectedTextContent,
  getTextContentFromBlockModels,
  selectedToCanvas,
} from '../utils/selection-utils.js';
import type { ChatContextValue } from './chat-context.js';

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

const ChatCardsConfig = [
  {
    name: 'current-selection',
    render: (text?: string, _?: File, __?: string) => {
      if (!text) return nothing;

      const lines = text.split('\n');

      return html`<div class="card-wrapper">
        <div class="card-title">
          ${CurrentSelectionIcon}
          <div>Start with current selection</div>
        </div>
        <div class="second-text">
          ${repeat(
            lines.slice(0, 2),
            line => line,
            line => {
              return html`<div
                style=${styleMap({
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                })}
              >
                ${line}
              </div>`;
            }
          )}
        </div>
      </div> `;
    },
    handler: (
      updateContext: (context: Partial<ChatContextValue>) => void,
      text: string,
      markdown: string,
      images?: File[]
    ) => {
      const value: Partial<ChatContextValue> = {
        quote: text,
        markdown: markdown,
      };
      if (images) {
        value.images = images;
      }
      updateContext(value);
    },
  },
  {
    name: 'image',
    render: (_?: string, image?: File, caption?: string) => {
      if (!image) return nothing;

      return html`<div
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
      </div>`;
    },
    handler: (
      updateContext: (context: Partial<ChatContextValue>) => void,
      _: string,
      __: string,
      images?: File[]
    ) => {
      const value: Partial<ChatContextValue> = {};
      if (images) {
        value.images = images;
      }
      updateContext(value);
    },
  },
  {
    name: 'doc',
    render: () => {
      return html`
        <div class="card-wrapper">
          <div class="card-title">
            ${DocIcon}
            <div>Start with this doc</div>
          </div>
          <div class="second-text">you've chosen within the doc</div>
        </div>
      `;
    },
    handler: (
      updateContext: (context: Partial<ChatContextValue>) => void,
      text: string,
      markdown: string,
      images?: File[]
    ) => {
      const value: Partial<ChatContextValue> = {
        quote: text,
        markdown: markdown,
      };
      if (images) {
        value.images = images;
      }
      updateContext(value);
    },
  },
];

@customElement('chat-cards')
export class ChatCards extends WithDisposable(LitElement) {
  static override styles = css`
    ${cardsStyles}
    .cards-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor chatContextValue!: ChatContextValue;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<ChatContextValue>) => void;

  @property({ attribute: false })
  accessor selectionValue: BaseSelection[] = [];

  @state()
  accessor text: string = '';

  @state()
  accessor markdown: string = '';

  @state()
  accessor images: File[] = [];

  @state()
  accessor caption: string = '';

  private _onEdgelessCopilotAreaUpdated() {
    if (!this.host.closest('edgeless-editor')) return;
    const edgeless = getEdgelessRootFromEditor(this.host);

    const copilotSelectionTool = edgeless.tools.controllers
      .copilot as CopilotSelectionController;

    this._disposables.add(
      copilotSelectionTool.draggingAreaUpdated.on(
        debounce(() => {
          selectedToCanvas(this.host)
            .then(canvas => {
              canvas?.toBlob(blob => {
                if (!blob) return;
                const file = new File([blob], 'selected.png');
                this.images = [file];
              });
            })
            .catch(console.error);
        }, 300)
      )
    );
  }

  private async _updateState() {
    if (
      this.selectionValue.some(
        selection => selection.is('text') || selection.is('image')
      )
    )
      return;
    this.text = await getSelectedTextContent(this.host, 'plain-text');
    this.markdown = await getSelectedTextContent(this.host, 'markdown');
    this.images = await getSelectedImagesAsBlobs(this.host);
    const [_, data] = this.host.command
      .chain()
      .tryAll(chain => [
        chain.getTextSelection(),
        chain.getBlockSelections(),
        chain.getImageSelections(),
      ])
      .getSelectedBlocks({
        types: ['image'],
      })
      .run();
    if (data.currentBlockSelections?.[0]) {
      this.caption =
        (
          this.host.doc.getBlock(data.currentBlockSelections[0].blockId)
            ?.model as ImageBlockModel
        ).caption ?? '';
    }
  }

  private async _handleDocSelection() {
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
    this.text = text;
    this.markdown = markdown;
    this.images = images;
  }

  protected override async updated(_changedProperties: PropertyValues) {
    if (_changedProperties.has('selectionValue')) {
      await this._updateState();
    }

    if (_changedProperties.has('host')) {
      this._onEdgelessCopilotAreaUpdated();
    }
  }

  protected override render() {
    return html`<div class="cards-container">
      ${repeat(
        ChatCardsConfig,
        card => card.name,
        card => {
          if (
            card.render(this.text, this.images[0], this.caption) !== nothing
          ) {
            return html`<div
              @click=${async () => {
                if (card.name === 'doc') {
                  await this._handleDocSelection();
                }
                card.handler(
                  this.updateContext,
                  this.text,
                  this.markdown,
                  this.images
                );
              }}
            >
              ${card.render(this.text, this.images[0], this.caption)}
            </div> `;
          }
          return nothing;
        }
      )}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-cards': ChatCards;
  }
}
