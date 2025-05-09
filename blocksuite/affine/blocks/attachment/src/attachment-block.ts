import {
  CaptionedBlockComponent,
  SelectedStyle,
} from '@blocksuite/affine-components/caption';
import {
  getAttachmentFileIcon,
  getLoadingIconWith,
} from '@blocksuite/affine-components/icons';
import { Peekable } from '@blocksuite/affine-components/peek';
import {
  type ResolvedStateInfo,
  ResourceController,
} from '@blocksuite/affine-components/resource';
import { toast } from '@blocksuite/affine-components/toast';
import {
  type AttachmentBlockModel,
  AttachmentBlockStyles,
} from '@blocksuite/affine-model';
import {
  FileSizeLimitProvider,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import { humanFileSize } from '@blocksuite/affine-shared/utils';
import {
  AttachmentIcon,
  ResetIcon,
  UpgradeIcon,
  WarningIcon,
} from '@blocksuite/icons/lit';
import { BlockSelection } from '@blocksuite/std';
import { Slice } from '@blocksuite/store';
import { computed } from '@preact/signals-core';
import { html, type TemplateResult } from 'lit';
import { choose } from 'lit/directives/choose.js';
import { type ClassInfo, classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { when } from 'lit/directives/when.js';

import { AttachmentEmbedProvider } from './embed';
import { styles } from './styles';
import { downloadAttachmentBlob, refreshData } from './utils';

@Peekable({
  enableOn: ({ model }: AttachmentBlockComponent) => {
    return !model.store.readonly && model.props.type.endsWith('pdf');
  },
})
export class AttachmentBlockComponent extends CaptionedBlockComponent<AttachmentBlockModel> {
  static override styles = styles;

  blockDraggable = true;

  resourceController = new ResourceController(
    computed(() => this.model.props.sourceId$.value)
  );

  get blobUrl() {
    return this.resourceController.blobUrl$.value;
  }

  protected containerStyleMap = styleMap({
    position: 'relative',
    width: '100%',
    margin: '18px 0px',
  });

  private get _maxFileSize() {
    return this.std.get(FileSizeLimitProvider).maxFileSize;
  }

  get isCitation() {
    return !!this.model.props.footnoteIdentifier;
  }

  convertTo = () => {
    return this.std
      .get(AttachmentEmbedProvider)
      .convertTo(this.model, this._maxFileSize);
  };

  copy = () => {
    const slice = Slice.fromModels(this.store, [this.model]);
    this.std.clipboard.copySlice(slice).catch(console.error);
    toast(this.host, 'Copied to clipboard');
  };

  download = () => {
    downloadAttachmentBlob(this);
  };

  embedded = () => {
    return (
      Boolean(this.blobUrl) &&
      this.std
        .get(AttachmentEmbedProvider)
        .embedded(this.model, this._maxFileSize)
    );
  };

  open = () => {
    const blobUrl = this.blobUrl;
    if (!blobUrl) return;
    window.open(blobUrl, '_blank');
  };

  refreshData = () => {
    refreshData(this).catch(console.error);
  };

  protected get embedView() {
    return this.std
      .get(AttachmentEmbedProvider)
      .render(this.model, this.blobUrl ?? undefined, this._maxFileSize);
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

    this.contentEditable = 'false';

    this.resourceController.setEngine(this.std.store.blobSync);

    this.disposables.add(this.resourceController.subscribe());
    this.disposables.add(this.resourceController);

    this.refreshData();

    if (!this.model.props.style && !this.store.readonly) {
      this.store.withoutTransact(() => {
        this.store.updateBlock(this.model, {
          style: AttachmentBlockStyles[1],
        });
      });
    }
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

  protected renderUpgradeButton = () => {
    if (this.std.store.readonly) return null;

    const onOverFileSize = this.std.get(FileSizeLimitProvider).onOverFileSize;

    return when(
      onOverFileSize,
      () => html`
        <button
          class="affine-attachment-content-button"
          @click=${(event: MouseEvent) => {
            event.stopPropagation();
            onOverFileSize?.();
          }}
        >
          ${UpgradeIcon()} Upgrade
        </button>
      `
    );
  };

  protected renderReloadButton = () => {
    return html`
      <button
        class="affine-attachment-content-button"
        @click=${(event: MouseEvent) => {
          event.stopPropagation();
          this.refreshData();
        }}
      >
        ${ResetIcon()} Reload
      </button>
    `;
  };

  protected renderWithHorizontal(
    classInfo: ClassInfo,
    { icon, title, description, state }: ResolvedStateInfo,
    kind: TemplateResult
  ) {
    return html`<div class=${classMap(classInfo)}>
      <div class="affine-attachment-content">
        <div class="affine-attachment-content-title">
          <div class="affine-attachment-content-title-icon">${icon}</div>
          <div class="affine-attachment-content-title-text truncate">
            ${title}
          </div>
        </div>

        <div class="affine-attachment-content-description">
          <div class="affine-attachment-content-info truncate">
            ${description}
          </div>
          ${choose(state, [
            ['error', this.renderReloadButton],
            ['error:oversize', this.renderUpgradeButton],
          ])}
        </div>
      </div>

      <div class="affine-attachment-banner">${kind}</div>
    </div>`;
  }

  protected renderWithVertical(
    classInfo: ClassInfo,
    { icon, title, description, state }: ResolvedStateInfo,
    kind: TemplateResult
  ) {
    return html`<div class=${classMap(classInfo)}>
      <div class="affine-attachment-content">
        <div class="affine-attachment-content-title">
          <div class="affine-attachment-content-title-icon">${icon}</div>
          <div class="affine-attachment-content-title-text truncate">
            ${title}
          </div>
        </div>

        <div class="affine-attachment-content-info truncate">
          ${description}
        </div>
      </div>

      <div class="affine-attachment-banner">
        ${kind}
        ${choose(state, [
          ['error', this.renderReloadButton],
          ['error:oversize', this.renderUpgradeButton],
        ])}
      </div>
    </div>`;
  }

  protected renderCard = () => {
    const theme = this.std.get(ThemeProvider).theme$.value;
    const loadingIcon = getLoadingIconWith(theme);

    const { name, size, style } = this.model.props;
    const cardStyle = style ?? AttachmentBlockStyles[1];
    const kind = getAttachmentFileIcon(name.split('.').pop() ?? '');

    const resolvedState = this.resourceController.resolveStateWith({
      loadingIcon,
      errorIcon: WarningIcon(),
      icon: AttachmentIcon(),
      title: name,
      description: humanFileSize(size),
    });

    const classInfo = {
      'affine-attachment-card': true,
      [cardStyle]: true,
      loading: resolvedState.loading,
      error: resolvedState.error,
    };

    return when(
      cardStyle === 'cubeThick',
      () => this.renderWithVertical(classInfo, resolvedState, kind),
      () => this.renderWithHorizontal(classInfo, resolvedState, kind)
    );
  };

  private readonly _renderCitation = () => {
    const { name, footnoteIdentifier } = this.model.props;
    const fileType = name.split('.').pop() ?? '';
    const fileTypeIcon = getAttachmentFileIcon(fileType);
    return html`<affine-citation-card
      .icon=${fileTypeIcon}
      .citationTitle=${name}
      .citationIdentifier=${footnoteIdentifier}
      .active=${this.selected$.value}
    ></affine-citation-card>`;
  };

  override renderBlock() {
    return html`
      <div
        class=${classMap({
          'affine-attachment-container': true,
          focused: this.selected$.value,
        })}
        style=${this.containerStyleMap}
      >
        ${when(
          this.isCitation,
          () => this._renderCitation(),
          () =>
            when(
              this.embedView,
              () =>
                html`<div class="affine-attachment-embed-container">
                  ${this.embedView}
                </div>`,
              this.renderCard
            )
        )}
      </div>
    `;
  }

  override accessor selectedStyle = SelectedStyle.Border;

  override accessor useCaptionEditor = true;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-attachment': AttachmentBlockComponent;
  }
}
