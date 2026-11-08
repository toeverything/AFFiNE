import track from '@affine/track';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { Signal } from '@preact/signals-core';
import { html } from 'lit';
import { property } from 'lit/decorators.js';

import type { DocChip, DocDisplayConfig } from './type';
import { getChipIcon, getChipTooltip } from './utils';

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
  accessor removeChip!: (chip: DocChip) => void;

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
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.disposables.dispose();
  }

  private readonly onChipClick = async () => {
    if (this.chip.state === 'candidate') {
      this.addChip({
        ...this.chip,
        state: 'finished',
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
