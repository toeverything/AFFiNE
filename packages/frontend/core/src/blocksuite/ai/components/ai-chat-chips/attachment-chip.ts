import { getAttachmentFileIcon } from '@blocksuite/affine/components/icons';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { html } from 'lit';
import { property } from 'lit/decorators.js';

import type { AttachmentChip } from './type';
import { getChipIcon, getChipTooltip } from './utils';

export class ChatPanelAttachmentChip extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  @property({ attribute: false })
  accessor chip!: AttachmentChip;

  @property({ attribute: false })
  accessor removeChip!: (chip: AttachmentChip) => void;

  override render() {
    const { state, name } = this.chip;
    const isLoading = state === 'processing';
    const tooltip = getChipTooltip(state, name, this.chip.tooltip);
    const fileType = name.split('.').pop() ?? '';
    const fileIcon = getAttachmentFileIcon(fileType);
    const icon = getChipIcon(state, fileIcon);

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
