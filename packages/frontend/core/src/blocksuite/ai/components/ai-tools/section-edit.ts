import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import type { ColorScheme } from '@blocksuite/affine/model';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import {
  type BlockSelection,
  type EditorHost,
  ShadowlessElement,
  type TextSelection,
} from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import type { NotificationService } from '@blocksuite/affine-shared/services';
import { isInsidePageEditor } from '@blocksuite/affine-shared/utils';
import {
  CopyIcon,
  InsertBleowIcon,
  LinkedPageIcon,
  PageIcon,
} from '@blocksuite/icons/lit';
import type { Signal } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import {
  EDGELESS_INSERT,
  PAGE_INSERT,
  SAVE_AS_DOC,
} from '../../_common/chat-actions-handle';
import { copyText } from '../../utils/editor-actions';
import type { ToolError } from './type';

interface SectionEditToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: { section: string; instructions: string };
}

interface SectionEditToolResult {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  args: { section: string; instructions: string };
  result: { content: string } | ToolError | null;
}

export class SectionEditTool extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .section-edit-result {
      padding: 12px;
      margin: 8px 0;
      border-radius: 8px;
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};

      .section-edit-header {
        height: 24px;
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;

        .section-edit-title {
          display: flex;
          align-items: center;
          gap: 8px;

          svg {
            width: 24px;
            height: 24px;
            color: ${unsafeCSSVarV2('icon/primary')};
          }

          span {
            font-size: 14px;
            font-weight: 500;
            color: ${unsafeCSSVarV2('icon/primary')};
            line-height: 24px;
          }
        }

        .section-edit-actions {
          display: flex;
          align-items: center;
          gap: 8px;

          .edit-button {
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            cursor: pointer;
            &:hover {
              background-color: ${unsafeCSSVarV2(
                'layer/background/hoverOverlay'
              )};
            }

            svg {
              width: 20px;
              height: 20px;
              color: ${unsafeCSSVarV2('icon/primary')};
            }
          }
        }
      }
    }
  `;

  @property({ attribute: false })
  accessor data!: SectionEditToolCall | SectionEditToolResult;

  @property({ attribute: false })
  accessor extensions!: ExtensionType[];

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @property({ attribute: false })
  accessor theme!: Signal<ColorScheme>;

  @property({ attribute: false })
  accessor host: EditorHost | null | undefined;

  @property({ attribute: false })
  accessor independentMode: boolean | undefined;

  private get selection() {
    const value = this.host?.selection.value ?? [];
    return {
      text: value.find(v => v.type === 'text') as TextSelection | undefined,
      blocks: value.filter(v => v.type === 'block') as BlockSelection[],
    };
  }

  renderToolCall() {
    return html`
      <tool-call-card
        .name=${`Editing: ${this.data.args.instructions}`}
        .icon=${PageIcon()}
      ></tool-call-card>
    `;
  }

  renderToolResult() {
    if (this.data.type !== 'tool-result') {
      return nothing;
    }

    const result = this.data.result;
    if (result && 'content' in result) {
      return html`
        <div class="section-edit-result">
          <div class="section-edit-header">
            <div class="section-edit-title">
              ${PageIcon()}
              <span>Edited Content</span>
            </div>
            <div class="section-edit-actions">
              <div
                class="edit-button"
                @click=${async () => {
                  const success = await copyText(result.content);
                  if (success) {
                    this.notifySuccess('Copied to clipboard');
                  }
                }}
              >
                ${CopyIcon()}
                <affine-tooltip>Copy</affine-tooltip>
              </div>
              ${this.independentMode
                ? nothing
                : html`<div
                    class="edit-button"
                    @click=${async () => {
                      if (!this.host) return;
                      if (this.host.std.store.readonly$.value) {
                        this.notificationService.notify({
                          title: 'Cannot insert in read-only mode',
                          accent: 'error',
                          onClose: () => {},
                        });
                        return;
                      }
                      if (isInsidePageEditor(this.host)) {
                        await PAGE_INSERT.handler(
                          this.host,
                          result.content,
                          this.selection
                        );
                      } else {
                        await EDGELESS_INSERT.handler(
                          this.host,
                          result.content,
                          this.selection
                        );
                      }
                    }}
                  >
                    ${InsertBleowIcon()}
                    <affine-tooltip>Insert below</affine-tooltip>
                  </div>`}
              ${this.independentMode
                ? nothing
                : html`<div
                    class="edit-button"
                    @click=${async () => {
                      if (!this.host) return;
                      SAVE_AS_DOC.handler(this.host, result.content);
                    }}
                  >
                    ${LinkedPageIcon()}
                    <affine-tooltip>Create new doc</affine-tooltip>
                  </div>`}
            </div>
          </div>
          <chat-content-rich-text
            .text=${result.content}
            .state=${'finished'}
            .extensions=${this.extensions}
            .affineFeatureFlagService=${this.affineFeatureFlagService}
            .theme=${this.theme}
          ></chat-content-rich-text>
        </div>
      `;
    }

    return html`
      <tool-call-failed
        .name=${'Section edit failed'}
        .icon=${PageIcon()}
      ></tool-call-failed>
    `;
  }

  private readonly notifySuccess = (title: string) => {
    this.notificationService.notify({
      title: title,
      accent: 'success',
      onClose: function (): void {},
    });
  };

  protected override render() {
    const { data } = this;

    if (data.type === 'tool-call') {
      return this.renderToolCall();
    }
    if (data.type === 'tool-result') {
      return this.renderToolResult();
    }
    return nothing;
  }
}
