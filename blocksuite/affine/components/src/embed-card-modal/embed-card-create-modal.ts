import {
  EmbedOptionProvider,
  VirtualKeyboardProvider,
} from '@blocksuite/affine-shared/services';
import { isValidUrl, stopPropagation } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import type { EditorHost } from '@blocksuite/std';
import { ShadowlessElement } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';
import { html } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit-html/directives/style-map.js';

import { toast } from '../toast';
import { embedCardModalStyles } from './styles.js';

export class EmbedCardCreateModal extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = embedCardModalStyles;

  private readonly _onCancel = () => {
    this.remove();
  };

  private readonly _onConfirm = () => {
    const url = this.input.value;

    if (!isValidUrl(url)) {
      toast(this.host, 'Invalid link');
      return;
    }

    const embedOptions = this.host.std
      .get(EmbedOptionProvider)
      .getEmbedBlockOptions(url);

    const { mode } = this.createOptions;
    if (mode === 'page') {
      const { parentModel, index } = this.createOptions;
      let flavour = 'affine:bookmark';

      if (embedOptions) {
        flavour = embedOptions.flavour;
      }

      this.host.store.addBlock(
        flavour as never,
        {
          url,
        },
        parentModel,
        index
      );
    } else if (mode === 'edgeless') {
      const gfx = this.host.std.get(GfxControllerIdentifier);
      const surfaceModel = gfx.surface;
      if (!surfaceModel) {
        return;
      }

      this.createOptions.onSave(url);
    }
    this.onConfirm({ mode });
    this.remove();
  };

  private readonly _onDocumentKeydown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing) {
      this._onConfirm();
    }
    if (e.key === 'Escape') {
      this.remove();
    }
  };

  private _handleInput(e: InputEvent) {
    const target = e.target as HTMLInputElement;
    this._linkInputValue = target.value;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.updateComplete
      .then(() => {
        requestAnimationFrame(() => {
          this.input.focus();
        });
      })
      .catch(console.error);
    this.disposables.addFromEvent(this, 'keydown', this._onDocumentKeydown);
    this.disposables.addFromEvent(this, 'cut', stopPropagation);
    this.disposables.addFromEvent(this, 'copy', stopPropagation);
    this.disposables.addFromEvent(this, 'paste', stopPropagation);
  }

  override render() {
    const keyboard = this.host.std.getOptional(VirtualKeyboardProvider);
    const style = styleMap({
      height: keyboard?.visible$.value
        ? `calc(100% - ${keyboard.height$.value}px)`
        : undefined,
    });

    return html`<div class="embed-card-modal" style=${style}>
      <div class="embed-card-modal-mask" @click=${this._onCancel}></div>
      <div class="embed-card-modal-wrapper">
        <div class="embed-card-modal-row">
          <div class="embed-card-modal-title">${this.titleText}</div>
        </div>

        <div class="embed-card-modal-row">
          <div class="embed-card-modal-description">
            ${this.descriptionText}
          </div>
        </div>

        <div class="embed-card-modal-row">
          <input
            class="embed-card-modal-input link"
            id="card-description"
            type="text"
            placeholder="Input in https://..."
            value=${this._linkInputValue}
            @input=${this._handleInput}
          />
        </div>

        <div class="embed-card-modal-row">
          <button
            class=${classMap({
              'embed-card-modal-button': true,
              save: true,
            })}
            ?disabled=${!isValidUrl(this._linkInputValue)}
            @click=${this._onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>`;
  }

  @state()
  private accessor _linkInputValue = '';

  @property({ attribute: false })
  accessor createOptions!:
    | {
        mode: 'page';
        parentModel: BlockModel | string;
        index?: number;
      }
    | {
        mode: 'edgeless';
        onSave: (url: string) => void;
      };

  @property({ attribute: false })
  accessor descriptionText!: string;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @query('input')
  accessor input!: HTMLInputElement;

  @property({ attribute: false })
  accessor onConfirm!: (options: { mode: 'edgeless' | 'page' }) => void;

  @property({ attribute: false })
  accessor titleText!: string;
}

export async function toggleEmbedCardCreateModal(
  host: EditorHost,
  titleText: string,
  descriptionText: string,
  createOptions:
    | {
        mode: 'page';
        parentModel: BlockModel | string;
        index?: number;
      }
    | {
        mode: 'edgeless';
        onSave: (url: string) => void;
      },
  onConfirm: (options: { mode: 'page' | 'edgeless' }) => void
): Promise<void> {
  host.selection.clear();

  const embedCardCreateModal = new EmbedCardCreateModal();
  embedCardCreateModal.host = host;
  embedCardCreateModal.titleText = titleText;
  embedCardCreateModal.descriptionText = descriptionText;
  embedCardCreateModal.createOptions = createOptions;

  document.body.append(embedCardCreateModal);

  return new Promise(resolve => {
    embedCardCreateModal.onConfirm = options => {
      onConfirm(options);
      resolve();
    };
  });
}

declare global {
  interface HTMLElementTagNameMap {
    'embed-card-create-modal': EmbedCardCreateModal;
  }
}
