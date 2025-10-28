import track from '@affine/track';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { Signal } from '@preact/signals-core';
import { html, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import throttle from 'lodash-es/throttle';

import { extractMarkdownFromDoc } from '../../utils/extract';
import type { DocChip, DocDisplayConfig } from './type';
import { estimateTokenCount, getChipIcon, getChipTooltip } from './utils';

const EXTRACT_DOC_THROTTLE = 1000;

export class ChatPanelDocChip extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  @property({ attribute: false })
  accessor chip!: DocChip;

  @property({ attribute: false })
  accessor independentMode: boolean | undefined;

  @property({ attribute: false })
  accessor addChip!: (chip: DocChip) => void;

  @property({ attribute: false })
  accessor updateChip!: (chip: DocChip, options: Partial<DocChip>) => void;

  @property({ attribute: false })
  accessor removeChip!: (chip: DocChip) => void;

  @property({ attribute: false })
  accessor checkTokenLimit!: (
    newChip: DocChip,
    newTokenCount: number
  ) => boolean;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  private chipName = new Signal<string>('');

  override connectedCallback() {
    super.connectedCallback();

    const { signal, cleanup } = this.docDisplayConfig.getTitleSignal(
      this.chip.docId
    );
    this.chipName = signal;
    this.disposables.add(cleanup);

    const doc = this.docDisplayConfig.getDoc(this.chip.docId);
    if (doc) {
      this.disposables.add(
        doc.slots.blockUpdated.subscribe(
          throttle(this.autoUpdateChip, EXTRACT_DOC_THROTTLE)
        )
      );
      this.autoUpdateChip();
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties);
    if (
      changedProperties.has('chip') &&
      this.chip.state === 'processing' &&
      !this.chip.markdown
    ) {
      this.processDocChip().catch(console.error);
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.disposables.dispose();
  }

  private readonly onChipClick = async () => {
    if (this.chip.state === 'candidate') {
      this.addChip({
        ...this.chip,
        state: 'processing',
      });
      const mode = this.docDisplayConfig.getDocPrimaryMode(this.chip.docId);
      const page = this.independentMode
        ? track.$.intelligence
        : track.$.chatPanel;
      page.chatPanelInput.addEmbeddingDoc({
        control: 'addButton',
        method: 'suggestion',
        type: mode,
      });
    }
  };

  private readonly onChipDelete = () => {
    this.removeChip(this.chip);
  };

  private readonly autoUpdateChip = () => {
    if (this.chip.state !== 'candidate') {
      this.processDocChip().catch(console.error);
    }
  };

  private readonly processDocChip = async () => {
    try {
      const doc = this.docDisplayConfig.getDoc(this.chip.docId);
      if (!doc) {
        throw new Error('Document not found');
      }
      if (!doc.ready) {
        doc.load();
      }
      const value = await extractMarkdownFromDoc(doc);
      const tokenCount = estimateTokenCount(value);
      if (this.checkTokenLimit(this.chip, tokenCount)) {
        const markdown = this.chip.markdown ?? new Signal<string>('');
        markdown.value = value;
        this.updateChip(this.chip, {
          markdown,
          tokenCount,
        });
      } else {
        this.updateChip(this.chip, {
          state: 'failed',
          tooltip: 'Content exceeds token limit',
        });
      }
    } catch (e) {
      this.updateChip(this.chip, {
        state: 'failed',
        tooltip: e instanceof Error ? e.message : 'Failed to extract markdown',
      });
    }
  };

  override render() {
    const { state, docId } = this.chip;
    const isLoading = state === 'processing';
    const getIcon = this.docDisplayConfig.getIcon(docId);
    const docIcon = typeof getIcon === 'function' ? getIcon() : getIcon;
    const icon = getChipIcon(state, docIcon);
    const tooltip = getChipTooltip(
      state,
      this.chipName.value,
      this.chip.tooltip
    );

    return html`<chat-panel-chip
      .state=${state}
      .name=${this.chipName.value}
      .tooltip=${tooltip}
      .icon=${icon}
      .closeable=${!isLoading}
      .onChipClick=${this.onChipClick}
      .onChipDelete=${this.onChipDelete}
    ></chat-panel-chip>`;
  }
}
