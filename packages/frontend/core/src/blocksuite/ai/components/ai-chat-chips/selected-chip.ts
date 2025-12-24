import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { UngroupIcon } from '@blocksuite/icons/lit';
import { html } from 'lit';
import { property } from 'lit/decorators.js';

import type { SelectedContextChip } from './type';
import { getChipIcon, getChipTooltip } from './utils';

export class ChatPanelSelectedChip extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  @property({ attribute: false })
  accessor chip!: SelectedContextChip;

  @property({ attribute: false })
  accessor removeChip!: (chip: SelectedContextChip) => void;

  override render() {
    const { state } = this.chip;
    const isLoading = state === 'processing';
    const tooltip = getChipTooltip(
      state,
      'selected-content',
      this.chip.tooltip
    );

    const icon = getChipIcon(state, UngroupIcon());

    return html`<chat-panel-chip
      .state=${state}
      .name=${'selected-content'}
      .tooltip=${tooltip}
      .icon=${icon}
      .closeable=${!isLoading}
      .onChipDelete=${this.onChipDelete}
    ></chat-panel-chip>`;
  }

  private readonly onChipDelete = () => {
    this.removeChip(this.chip);
  };
}
