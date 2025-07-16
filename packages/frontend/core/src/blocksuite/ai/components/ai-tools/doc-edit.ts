import track from '@affine/track';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { type EditorHost, ShadowlessElement } from '@blocksuite/affine/std';
import { LoadingIcon } from '@blocksuite/affine-components/icons';
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
import { repeat } from 'lit/directives/repeat.js';

import { AIProvider } from '../../provider';
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
        result: {
          op: string;
          updates: string;
          originalContent: string;
          changedContent: string;
        }[];
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
      background: ${unsafeCSSVar('--affine-overlay-panel-shadow')};
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

          button {
            cursor: pointer;
            padding: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
          }

          button:hover {
            background: ${unsafeCSSVar('hoverColor')};
          }
        }
      }

      .doc-edit-tool-result-card-content {
        padding: 8px;
        width: 100%;
        border-top: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      }

      .doc-edit-tool-result-card-footer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 4px;
        width: 100%;
        cursor: pointer;

        button {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px;
          border-radius: 4px;
        }

        button:hover {
          background: ${unsafeCSSVar('hoverColor')};
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

  @state()
  accessor applyingMap: Record<string, boolean> = {};

  @state()
  accessor acceptingMap: Record<string, boolean> = {};

  get blockDiffService() {
    return this.host?.std.getOptional(BlockDiffProvider);
  }

  get isBusy() {
    return undefined;
  }

  isBusyForOp(op: string) {
    return this.applyingMap[op] || this.acceptingMap[op];
  }

  private async _handleApply(op: string, updates: string) {
    if (
      !this.host ||
      this.data.type !== 'tool-result' ||
      this.isBusyForOp(op)
    ) {
      return;
    }
    this.applyingMap = { ...this.applyingMap, [op]: true };
    try {
      const markdown = await AIProvider.context?.applyDocUpdates(
        this.host.std.workspace.id,
        this.data.args.doc_id,
        op,
        updates
      );
      if (!markdown) {
        return;
      }
      track.applyModel.chat.$.apply({
        instruction: this.data.args.instructions,
        operation: op,
      });
      await this.blockDiffService?.apply(this.host.store, markdown);
    } catch (error) {
      this.notificationService.notify({
        title: 'Failed to apply updates',
        message: error instanceof Error ? error.message : 'Unknown error',
        accent: 'error',
        onClose: function (): void {},
      });
    } finally {
      this.applyingMap = { ...this.applyingMap, [op]: false };
    }
  }

  private async _handleReject(op: string) {
    if (!this.host || this.data.type !== 'tool-result') {
      return;
    }
    // TODO: set the rejected status
    track.applyModel.chat.$.reject({
      instruction: this.data.args.instructions,
      operation: op,
    });
    this.blockDiffService?.setChangedMarkdown(null);
    this.blockDiffService?.rejectAll();
  }

  private async _handleAccept(op: string, updates: string) {
    if (
      !this.host ||
      this.data.type !== 'tool-result' ||
      this.isBusyForOp(op)
    ) {
      return;
    }
    this.acceptingMap = { ...this.acceptingMap, [op]: true };
    try {
      const changedMarkdown = await AIProvider.context?.applyDocUpdates(
        this.host.std.workspace.id,
        this.data.args.doc_id,
        op,
        updates
      );
      if (!changedMarkdown) {
        return;
      }
      track.applyModel.chat.$.accept({
        instruction: this.data.args.instructions,
        operation: op,
      });
      await this.blockDiffService?.apply(this.host.store, changedMarkdown);
      await this.blockDiffService?.acceptAll(this.host.store);
    } catch (error) {
      this.notificationService.notify({
        title: 'Failed to apply updates',
        message: error instanceof Error ? error.message : 'Unknown error',
        accent: 'error',
        onClose: function (): void {},
      });
    } finally {
      this.acceptingMap = { ...this.acceptingMap, [op]: false };
    }
  }

  private async _toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
  }

  private async _handleCopy(changedMarkdown: string) {
    if (!this.host) {
      return;
    }
    track.applyModel.chat.$.copy();
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

    if (result && 'result' in result && Array.isArray(result.result)) {
      const { doc_id: docId } = this.data.args;

      return repeat(
        result.result,
        change => change.op,
        ({ op, updates, originalContent, changedContent }) => {
          const diffs = diffMarkdown(originalContent, changedContent);
          return html`
            <div class="doc-edit-tool-result-wrapper">
              <div class="doc-edit-tool-result-title">${op}</div>
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
                    <button @click=${() => this._toggleCollapse()}>
                      ${this.isCollapsed ? ExpandFullIcon() : ExpandCloseIcon()}
                      <affine-tooltip>
                        ${this.isCollapsed ? 'Expand' : 'Collapse'}
                      </affine-tooltip>
                    </button>
                    <button @click=${() => this._handleCopy(changedContent)}>
                      ${CopyIcon()}
                      <affine-tooltip>Copy</affine-tooltip>
                    </button>
                    <button
                      @click=${() => this._handleApply(op, updates)}
                      ?disabled=${this.isBusyForOp(op)}
                    >
                      ${this.applyingMap[op]
                        ? html`${LoadingIcon()} Applying`
                        : 'Apply'}
                    </button>
                  </div>
                </div>
                <div class="doc-edit-tool-result-card-content">
                  ${this.renderBlockDiffs(diffs)}
                  <div class="doc-edit-tool-result-card-footer">
                    <button
                      class="doc-edit-tool-result-reject"
                      @click=${() => this._handleReject(op)}
                    >
                      ${CloseIcon({
                        style: `color: ${unsafeCSSVarV2('icon/secondary')}`,
                      })}
                      Reject
                    </button>
                    <button
                      class="doc-edit-tool-result-accept"
                      @click=${() => this._handleAccept(op, updates)}
                      ?disabled=${this.isBusyForOp(op)}
                      style="${this.isBusyForOp(op)
                        ? 'pointer-events: none; opacity: 0.6;'
                        : ''}"
                    >
                      ${this.acceptingMap[op]
                        ? html`${LoadingIcon()}`
                        : DoneIcon({
                            style: `color: ${unsafeCSSVarV2('icon/activated')}`,
                          })}
                      ${this.acceptingMap[op] ? 'Accepting...' : 'Accept'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }
      );
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
