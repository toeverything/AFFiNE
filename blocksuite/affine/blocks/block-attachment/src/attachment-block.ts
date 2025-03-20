import { getEmbedCardIcons } from '@blocksuite/affine-block-embed';
import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import {
  AttachmentIcon16,
  getAttachmentFileIcon,
} from '@blocksuite/affine-components/icons';
import { Peekable } from '@blocksuite/affine-components/peek';
import { toast } from '@blocksuite/affine-components/toast';
import {
  type AttachmentBlockModel,
  AttachmentBlockStyles,
} from '@blocksuite/affine-model';
import {
  FileSizeLimitService,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import { humanFileSize } from '@blocksuite/affine-shared/utils';
import { BlockSelection } from '@blocksuite/block-std';
import { Slice } from '@blocksuite/store';
import { html } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import { AttachmentEmbedProvider } from './embed';
import { styles } from './styles';
import { checkAttachmentBlob, downloadAttachmentBlob } from './utils';

@Peekable({
  enableOn: ({ model }: AttachmentBlockComponent) => {
    return model.props.type.endsWith('pdf');
  },
})
export class AttachmentBlockComponent extends CaptionedBlockComponent<AttachmentBlockModel> {
  static override styles = styles;

  blockDraggable = true;

  protected containerStyleMap = styleMap({
    position: 'relative',
    width: '100%',
    margin: '18px 0px',
  });

  private get _maxFileSize() {
    return this.std.store.get(FileSizeLimitService).maxFileSize;
  }

  convertTo = () => {
    return this.std
      .get(AttachmentEmbedProvider)
      .convertTo(this.model, this._maxFileSize);
  };

  copy = () => {
    const slice = Slice.fromModels(this.doc, [this.model]);
    this.std.clipboard.copySlice(slice).catch(console.error);
    toast(this.host, 'Copied to clipboard');
  };

  download = () => {
    downloadAttachmentBlob(this);
  };

  embedded = () => {
    return this.std
      .get(AttachmentEmbedProvider)
      .embedded(this.model, this._maxFileSize);
  };

  open = () => {
    if (!this.blobUrl) {
      return;
    }
    window.open(this.blobUrl, '_blank');
  };

  refreshData = () => {
    checkAttachmentBlob(this).catch(console.error);
  };

  protected get embedView() {
    return this.std
      .get(AttachmentEmbedProvider)
      .render(this.model, this.blobUrl, this._maxFileSize);
  }

  private _selectBlock() {
    const selectionManager = this.host.selection;
    const blockSelection = selectionManager.create(BlockSelection, {
      blockId: this.blockId,
    });
    selectionManager.setGroup('note', [blockSelection]);
  }

  override connectedCallback() {
    super.connectedCallback();

    this.refreshData();

    this.contentEditable = 'false';

    if (!this.model.props.style) {
      this.doc.withoutTransact(() => {
        this.doc.updateBlock(this.model, {
          style: AttachmentBlockStyles[1],
        });
      });
    }

    this.model.propsUpdated.subscribe(({ key }) => {
      if (key === 'sourceId') {
        // Reset the blob url when the sourceId is changed
        if (this.blobUrl) {
          URL.revokeObjectURL(this.blobUrl);
          this.blobUrl = undefined;
        }
        this.refreshData();
      }
    });

    // Workaround for https://github.com/toeverything/blocksuite/issues/4724
    this.disposables.add(
      this.std.get(ThemeProvider).theme$.subscribe(() => this.requestUpdate())
    );
  }

  override disconnectedCallback() {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
    }
    super.disconnectedCallback();
  }

  override firstUpdated() {
    // lazy bindings
    this.disposables.addFromEvent(this, 'click', this.onClick);
  }

  protected onClick(event: MouseEvent) {
    // the peek view need handle shift + click
    if (event.defaultPrevented) return;

    event.stopPropagation();

    if (!this.selected$.peek()) {
      this._selectBlock();
    }
  }

  override renderBlock() {
    const { name, size, style } = this.model.props;
    const cardStyle = style ?? AttachmentBlockStyles[1];

    const theme = this.std.get(ThemeProvider).theme;
    const { LoadingIcon } = getEmbedCardIcons(theme);

    const titleIcon = this.loading ? LoadingIcon : AttachmentIcon16;
    const titleText = this.loading ? 'Loading...' : name;
    const infoText = this.error ? 'File loading failed.' : humanFileSize(size);

    const fileType = name.split('.').pop() ?? '';
    const FileTypeIcon = getAttachmentFileIcon(fileType);

    const embedView = this.embedView;

    return html`
      <div class="affine-attachment-container" style=${this.containerStyleMap}>
        ${embedView
          ? html`<div class="affine-attachment-embed-container">
              ${embedView}
            </div>`
          : html`<div
              class=${classMap({
                'affine-attachment-card': true,
                [cardStyle]: true,
                loading: this.loading,
                error: this.error,
                unsynced: false,
              })}
            >
              <div class="affine-attachment-content">
                <div class="affine-attachment-content-title">
                  <div class="affine-attachment-content-title-icon">
                    ${titleIcon}
                  </div>

                  <div class="affine-attachment-content-title-text">
                    ${titleText}
                  </div>
                </div>

                <div class="affine-attachment-content-info">${infoText}</div>
              </div>

              <div class="affine-attachment-banner">${FileTypeIcon}</div>
            </div>`}
      </div>
    `;
  }

  @property({ attribute: false })
  accessor allowEmbed = false;

  @property({ attribute: false })
  accessor blobUrl: string | undefined = undefined;

  @property({ attribute: false })
  accessor downloading = false;

  @property({ attribute: false })
  accessor error = false;

  @property({ attribute: false })
  accessor loading = false;

  override accessor useCaptionEditor = true;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-attachment': AttachmentBlockComponent;
  }
}
