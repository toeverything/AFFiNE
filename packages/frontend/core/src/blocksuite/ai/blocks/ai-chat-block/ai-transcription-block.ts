import type { TranscriptionBlockModel } from '@affine/core/blocksuite/ai/blocks/transcription-block/model';
import { BlockComponent, BlockViewExtension } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import { css, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { literal } from 'lit/static-html.js';

export class LitTranscriptionBlock extends BlockComponent<TranscriptionBlockModel> {
  static override styles = [
    css`
      transcription-block {
        outline: none;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
    `,
  ];

  override render() {
    return this.std.host.renderChildren(this.model);
  }

  @property({ type: String, attribute: 'data-block-id' })
  override accessor blockId!: string;

  constructor() {
    super();
    // questionable:
    this.widgets = {};

    // to allow text selection across paragraphs in the callout block
    this.contentEditable = 'true';
  }

  override firstUpdated(changedProperties: PropertyValues) {
    super.firstUpdated(changedProperties);
    this.disposables.addFromEvent(this, 'click', this.onClick);
  }

  protected onClick(event: MouseEvent) {
    event.stopPropagation();
  }
}

export const AITranscriptionBlockSpec: ExtensionType[] = [
  BlockViewExtension('affine:transcription', () => {
    return literal`transcription-block`;
  }),
];
