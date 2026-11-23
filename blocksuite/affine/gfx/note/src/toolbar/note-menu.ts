import { addAttachments } from '@blocksuite/affine-block-attachment';
import { insertLinkByQuickSearchCommand } from '@blocksuite/affine-block-bookmark';
import { addImages } from '@blocksuite/affine-block-image';
import { DefaultTool } from '@blocksuite/affine-block-surface';
import { MAX_IMAGE_WIDTH } from '@blocksuite/affine-model';
import { TelemetryProvider } from '@blocksuite/affine-shared/services';
import type { NoteChildrenFlavour } from '@blocksuite/affine-shared/types';
import {
  getImageFilesFromLocal,
  openSingleFileWith,
} from '@blocksuite/affine-shared/utils';
import { EdgelessToolbarToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { AttachmentIcon, ImageIcon, LinkIcon } from '@blocksuite/icons/lit';
import type { ToolOptions } from '@blocksuite/std/gfx';
import { effect } from '@preact/signals-core';
import { css, html, LitElement } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { NoteTool, type NoteToolOption } from '../note-tool.js';
import { NOTE_MENU_ITEMS } from './note-menu-config.js';

export class EdgelessNoteMenu extends EdgelessToolbarToolMixin(LitElement) {
  static override styles = css`
    :host {
      position: absolute;
      display: flex;
      z-index: -1;
    }
    .menu-content {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .button-group-container {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 14px;
      fill: var(--affine-icon-color);
    }
    .button-group-container svg {
      width: 20px;
      height: 20px;
    }
    .divider {
      width: 1px;
      height: 24px;
      background: var(--affine-border-color);
      transform: scaleX(0.5);
      margin: 0 14px;
    }
  `;

  override type = NoteTool;

  private async _addImages() {
    this._imageLoading = true;
    const imageFiles = await getImageFilesFromLocal();
    const ids = await addImages(this.edgeless.std, imageFiles, {
      maxWidth: MAX_IMAGE_WIDTH,
    });
    this._imageLoading = false;
    this.gfx.tool.setTool(DefaultTool);
    this.gfx.selection.set({ elements: ids });
  }

  private _onHandleLinkButtonClick() {
    const [_, { insertedLinkType }] = this.edgeless.service.std.command.exec(
      insertLinkByQuickSearchCommand
    );

    insertedLinkType
      ?.then(type => {
        const flavour = type?.flavour;
        if (!flavour) return;

        this.edgeless.std
          .getOptional(TelemetryProvider)
          ?.track('CanvasElementAdded', {
            control: 'toolbar:general',
            page: 'whiteboard editor',
            module: 'toolbar',
            type: flavour.split(':')[1],
          });
      })
      .catch(console.error);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
  }

  override firstUpdated() {
    this.disposables.add(
      effect(() => {
        const tool = this.gfx.tool.currentToolOption$.value;

        if (tool?.toolType !== NoteTool) return;
        const options = tool.options as ToolOptions<NoteTool>;
        this.childFlavour = options.childFlavour;
        this.childType = options.childType;
        this.tip = options.tip;
      })
    );
  }

  override render() {
    const { childType } = this;

    return html`
      <edgeless-slide-menu>
        <div class="menu-content">
          <!-- add to edgeless -->
          <div class="button-group-container">
            <edgeless-tool-icon-button
              .activeMode=${'background'}
              .tooltip=${'Image'}
              @click=${this._addImages}
              .disabled=${this._imageLoading}
            >
              ${ImageIcon()}
            </edgeless-tool-icon-button>

            <edgeless-tool-icon-button
              .activeMode=${'background'}
              .tooltip=${html`<affine-tooltip-content-with-shortcut
                data-tip="${'Link'}"
                data-shortcut="${'@'}"
              ></affine-tooltip-content-with-shortcut>`}
              @click=${() => {
                this._onHandleLinkButtonClick();
              }}
            >
              ${LinkIcon()}
            </edgeless-tool-icon-button>

            <edgeless-tool-icon-button
              .activeMode=${'background'}
              .tooltip=${'File'}
              @click=${async () => {
                const file = await openSingleFileWith();
                if (!file) return;
                await addAttachments(this.edgeless.std, [file]);
                this.gfx.tool.setTool(DefaultTool);
                this.edgeless.std
                  .getOptional(TelemetryProvider)
                  ?.track('CanvasElementAdded', {
                    control: 'toolbar:general',
                    page: 'whiteboard editor',
                    module: 'toolbar',
                    segment: 'toolbar',
                    type: 'attachment',
                  });
              }}
            >
              ${AttachmentIcon()}
            </edgeless-tool-icon-button>
          </div>

          <div class="divider"></div>

          <!-- add to note -->
          <div class="button-group-container">
            ${repeat(
              NOTE_MENU_ITEMS,
              item => item.childFlavour,
              item => html`
                <edgeless-tool-icon-button
                  .active=${childType === item.childType}
                  .activeMode=${'background'}
                  .tooltip=${item.tooltip}
                  @click=${() =>
                    this.onChange({
                      childFlavour: item.childFlavour,
                      childType: item.childType,
                      tip: item.tooltip,
                    })}
                >
                  ${item.icon}
                </edgeless-tool-icon-button>
              `
            )}
          </div>
        </div>
      </edgeless-slide-menu>
    `;
  }

  @state()
  private accessor _imageLoading = false;

  @property({ attribute: false })
  accessor childFlavour!: NoteChildrenFlavour;

  @property({ attribute: false })
  accessor childType!: string | null;

  @property({ attribute: false })
  accessor onChange!: (
    props: Partial<{
      childFlavour: NoteToolOption['childFlavour'];
      childType: string | null;
      tip: string;
    }>
  ) => void;

  @property({ attribute: false })
  accessor tip!: string;
}
