import { WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { type EditorHost, ShadowlessElement } from '@blocksuite/affine/std';
import type { NotificationService } from '@blocksuite/affine-shared/services';
import {
  CloseIcon,
  CopyIcon,
  DoneIcon,
  ExpandCloseIcon,
  ExpandFullIcon,
  PenIcon as EditIcon,
  PenIcon,
} from '@blocksuite/icons/lit';
import { css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';

import { BlockDiffProvider } from '../../services/block-diff';
import { diffMarkdown } from '../../utils/apply-model/markdown-diff';
import { copyText } from '../../utils/editor-actions';
import type { ToolError } from './type';

interface DocEditToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: 'doc_edit';
}

interface DocEditToolResult {
  type: 'tool-result';
  toolCallId: string;
  toolName: 'doc_edit';
  args: {
    instructions: string;
    code_edit: string;
    doc_id: string;
  };
  result:
    | {
        result: string;
        content: string;
      }
    | ToolError
    | null;
}

function removeMarkdownComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->/g, '');
}

export class DocEditTool extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    :host {
      display: block;
    }

    .doc-edit-tool-result-wrapper {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 8px;

      svg {
        width: 20px;
        height: 20px;
      }
    }

    .doc-edit-tool-result-title {
      color: ${unsafeCSSVarV2('text/primary')};
      padding: 8px;
      margin-bottom: 8px;
    }

    .doc-edit-tool-result-card {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      background: ${unsafeCSSVarV2('layer/background/overlayPanel')};
      box-shadow: ${unsafeCSSVar('shadow1')};
      border-radius: 8px;
      width: 100%;

      .doc-edit-tool-result-card-header {
        display: flex;
        flex-direction: row;
        align-items: center;
        padding: 8px;

        width: 100%;
        justify-content: space-between;
        border-bottom: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};

        .doc-edit-tool-result-card-header-title {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 8px;
          color: ${unsafeCSSVarV2('text/primary')};
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }

        .doc-edit-tool-result-card-header-operations {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          padding-right: 8px;
          color: ${unsafeCSSVarV2('text/secondary')};

          span {
            width: 20px;
            height: 20px;
          }
        }
      }

      .doc-edit-tool-result-card-content {
        padding: 8px;
        width: 100%;
      }

      .doc-edit-tool-result-card-footer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        padding: 8px;
        gap: 4px;
        width: 100%;
        cursor: pointer;

        .doc-edit-tool-result-reject,
        .doc-edit-tool-result-accept {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 8px;
        }
      }

      &.collapsed .doc-edit-tool-result-card-content,
      &.collapsed .doc-edit-tool-result-card-footer {
        display: none;
      }

      .doc-edit-tool-result-card-diff {
        border-radius: 4px;
        padding: 8px;
        width: 100%;
      }

      .doc-edit-tool-result-card-diff-replace {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        margin-bottom: 8px;
        gap: 8px;

        .doc-edit-tool-result-card-diff.original {
          background: ${unsafeCSSVarV2('aI/applyDeleteHighlight')};
        }

        .doc-edit-tool-result-card-diff.modified {
          background: ${unsafeCSSVarV2('aI/applyTextHighlightBackground')};
        }
      }

      .doc-edit-tool-result-card-diff.deleted {
        background: ${unsafeCSSVarV2('aI/applyDeleteHighlight')};
        margin-bottom: 8px;
      }

      .doc-edit-tool-result-card-diff.insert {
        background: ${unsafeCSSVarV2('aI/applyTextHighlightBackground')};
        margin-bottom: 8px;
      }

      .doc-edit-tool-result-card-diff-title {
        font-size: 12px;
      }
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost | null;

  @property({ attribute: false })
  accessor data!: DocEditToolCall | DocEditToolResult;

  @property({ attribute: false })
  accessor renderRichText!: (text: string) => string;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @state()
  accessor isCollapsed = false;

  get blockDiffService() {
    return this.host?.std.getOptional(BlockDiffProvider);
  }

  private async _handleApply(markdown: string) {
    if (!this.host) {
      return;
    }
    await this.blockDiffService?.apply(this.host.store, markdown);
  }

  private async _handleReject(changedMarkdown: string) {
    if (!this.host) {
      return;
    }
    this.blockDiffService?.setChangedMarkdown(changedMarkdown);
    this.blockDiffService?.rejectAll();
  }

  private async _handleAccept(changedMarkdown: string) {
    if (!this.host) {
      return;
    }
    await this.blockDiffService?.apply(this.host.store, changedMarkdown);
    await this.blockDiffService?.acceptAll(this.host.store);
  }

  private async _toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
  }

  private async _handleCopy(changedMarkdown: string) {
    if (!this.host) {
      return;
    }
    const success = await copyText(removeMarkdownComments(changedMarkdown));
    if (success) {
      this.notificationService.notify({
        title: 'Copied to clipboard',
        accent: 'success',
        onClose: function (): void {},
      });
    }
  }

  renderToolCall() {
    return html`
      <tool-call-card
        .name=${'Editing the document'}
        .icon=${EditIcon()}
      ></tool-call-card>
    `;
  }

  renderSantizedText(text: string) {
    return this.renderRichText(removeMarkdownComments(text));
  }

  renderBlockDiffs(diffs: ReturnType<typeof diffMarkdown>) {
    const { patches, oldBlocks } = diffs;

    const oldBlockMap = new Map(oldBlocks.map(b => [b.id, b]));

    return html`
      <div>
        ${patches.map(patch => {
          if (patch.op === 'replace') {
            const oldBlock = oldBlockMap.get(patch.id);
            return html`
              <div class="doc-edit-tool-result-card-diff-replace">
                <div class="doc-edit-tool-result-card-diff original">
                  <div class="doc-edit-tool-result-card-diff-title">
                    Original
                  </div>
                  <div>${this.renderSantizedText(oldBlock?.content ?? '')}</div>
                </div>
                <div class="doc-edit-tool-result-card-diff modified">
                  <div class="doc-edit-tool-result-card-diff-title">
                    Modified
                  </div>
                  <div>${this.renderSantizedText(patch.content)}</div>
                </div>
              </div>
            `;
          } else if (patch.op === 'delete') {
            const oldBlock = oldBlockMap.get(patch.id);
            return html`
              <div class="doc-edit-tool-result-card-diff deleted">
                <div class="doc-edit-tool-result-card-diff-title">Deleted</div>
                <div>${this.renderSantizedText(oldBlock?.content ?? '')}</div>
              </div>
            `;
          } else if (patch.op === 'insert') {
            return html`
              <div class="doc-edit-tool-result-card-diff insert">
                <div class="doc-edit-tool-result-card-diff-title">Inserted</div>
                <div>${this.renderSantizedText(patch.block.content)}</div>
              </div>
            `;
          }
          return nothing;
        })}
      </div>
    `;
  }

  renderToolResult() {
    if (this.data.type !== 'tool-result') {
      return nothing;
    }

    const result = this.data.result;

    if (result && 'result' in result && 'content' in result) {
      const { result: changedMarkdown, content } = result;
      const { instructions, doc_id: docId } = this.data.args;

      const diffs = diffMarkdown(content, changedMarkdown);

      return html`
        <div class="doc-edit-tool-result-wrapper">
          <div class="doc-edit-tool-result-title">${instructions}</div>
          <div
            class="doc-edit-tool-result-card ${this.isCollapsed
              ? 'collapsed'
              : ''}"
          >
            <div class="doc-edit-tool-result-card-header">
              <div class="doc-edit-tool-result-card-header-title">
                ${PenIcon({
                  style: `color: ${unsafeCSSVarV2('icon/activated')}`,
                })}
                ${docId}
              </div>
              <div class="doc-edit-tool-result-card-header-operations">
                <span @click=${() => this._toggleCollapse()}
                  >${this.isCollapsed
                    ? ExpandFullIcon()
                    : ExpandCloseIcon()}</span
                >
                <span @click=${() => this._handleCopy(changedMarkdown)}>
                  ${CopyIcon()}
                </span>
                <button @click=${() => this._handleApply(changedMarkdown)}>
                  Apply
                </button>
              </div>
            </div>
            <div class="doc-edit-tool-result-card-content">
              <div class="doc-edit-tool-result-card-content-title">
                ${this.renderBlockDiffs(diffs)}
              </div>
            </div>
            <div class="doc-edit-tool-result-card-footer">
              <div
                class="doc-edit-tool-result-reject"
                @click=${() => this._handleReject(changedMarkdown)}
              >
                ${CloseIcon({
                  style: `color: ${unsafeCSSVarV2('icon/secondary')}`,
                })}
                Reject
              </div>
              <div
                class="doc-edit-tool-result-accept"
                @click=${() => this._handleAccept(changedMarkdown)}
              >
                ${DoneIcon({
                  style: `color: ${unsafeCSSVarV2('icon/activated')}`,
                })}
                Accept
              </div>
            </div>
          </div>
        </div>
      `;
    }

    return html`
      <tool-call-failed
        .name=${'Document editing failed'}
        .icon=${EditIcon()}
      ></tool-call-failed>
    `;
  }

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
