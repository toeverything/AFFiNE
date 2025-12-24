import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { CollectionsIcon } from '@blocksuite/icons/lit';
import { html } from 'lit';
import { property } from 'lit/decorators.js';

import type { CollectionChip } from './type';
import { getChipIcon, getChipTooltip } from './utils';

export class ChatPanelCollectionChip extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  @property({ attribute: false })
  accessor chip!: CollectionChip;

  @property({ attribute: false })
  accessor removeChip!: (chip: CollectionChip) => void;

  @property({ attribute: false })
  accessor collection!: { id: string; name: string };

  override render() {
    const { state } = this.chip;
    const { name } = this.collection;
    const isLoading = state === 'processing';
    const tooltip = getChipTooltip(state, name, this.chip.tooltip);
    const collectionIcon = CollectionsIcon();
    const icon = getChipIcon(state, collectionIcon);

    return html`<chat-panel-chip
      .state=${state}
      .name=${name}
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
