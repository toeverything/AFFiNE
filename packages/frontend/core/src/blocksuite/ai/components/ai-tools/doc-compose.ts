import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { getAFFiNEWorkspaceSchema } from '@affine/core/modules/workspace';
import { getEmbedLinkedDocIcons } from '@blocksuite/affine/blocks/embed-doc';
import { LoadingIcon } from '@blocksuite/affine/components/icons';
import { toast } from '@blocksuite/affine/components/toast';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { RefNodeSlotsProvider } from '@blocksuite/affine/inlines/reference';
import type { ColorScheme } from '@blocksuite/affine/model';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { type BlockStdScope, ShadowlessElement } from '@blocksuite/affine/std';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import type { NotificationService } from '@blocksuite/affine-shared/services';
import { CopyIcon, PageIcon, ToolIcon } from '@blocksuite/icons/lit';
import { type Signal } from '@preact/signals-core';
import { css, html, nothing, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';

import { getCustomPageEditorBlockSpecs } from '../text-renderer';
import {
  isPreviewPanelOpen,
  renderPreviewPanel,
} from './artifacts-preview-panel';
import type { ToolError } from './type';

interface DocComposeToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: string; // 'doc_compose'
  args: { title: string };
}

interface DocComposeToolResult {
  type: 'tool-result';
  toolCallId: string;
  toolName: string; // 'doc_compose'
  args: { title: string };
  result:
    | {
        title: string;
        markdown: string;
        wordCount: number;
      }
    | ToolError
    | null;
}

/**
 * Component to render doc compose tool call/result inside chat.
 */
export class DocComposeTool extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .doc-compose-result {
      cursor: pointer;
      margin: 8px 0;
    }

    .doc-compose-result:hover {
      background-color: var(--affine-hover-color);
    }

    .doc-compose-result-preview {
      padding: 24px;
      height: 100%;
    }

    .doc-compose-result-preview-title {
      font-size: 36px;
      font-weight: 600;
      padding: 14px 0px 38px 0px;
    }

    .doc-compose-result-save-as-doc {
      background: transparent;
      border-radius: 8px;
      border: 1px solid ${unsafeCSSVarV2('button/innerBlackBorder')};
      cursor: pointer;
      font-size: 15px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 8px;
      height: 32px;
      font-weight: 500;
    }

    .doc-compose-result-preview-loading {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }

    .doc-compose-result-save-as-doc:hover {
      background: ${unsafeCSSVarV2('switch/buttonBackground/hover')};
    }
  `;

  @property({ attribute: false })
  accessor data!: DocComposeToolCall | DocComposeToolResult;

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  @property({ attribute: false })
  accessor std: BlockStdScope | undefined;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @property({ attribute: false })
  accessor theme!: Signal<ColorScheme>;

  override updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    if (changedProperties.has('data') && isPreviewPanelOpen(this)) {
      this.updatePreviewPanel();
    }
  }

  private updatePreviewPanel() {
    if (!this.std) return;
    const std = this.std;
    const resultData = this.data;
    const composing = resultData.type === 'tool-call';
    const title = this.data.args.title;
    const result = resultData.type === 'tool-result' ? resultData.result : null;
    const successResult = result && 'markdown' in result ? result : null;

    const copyMarkdown = async () => {
      if (!successResult) {
        return;
      }
      await navigator.clipboard
        .writeText(successResult.markdown)
        .catch(console.error);
      toast(std.host, 'Copied markdown to clipboard');
    };

    const saveAsDoc = async () => {
      try {
        if (!successResult) {
          return;
        }
        const workspace = std.store.workspace;
        const refNodeSlots = std.getOptional(RefNodeSlotsProvider);
        const docId = await MarkdownTransformer.importMarkdownToDoc({
          collection: workspace,
          schema: getAFFiNEWorkspaceSchema(),
          markdown: successResult.markdown,
          fileName: title,
          extensions: getStoreManager().config.init().value.get('store'),
        });
        if (docId) {
          const open = await this.notificationService.confirm({
            title: 'Open the doc you just created',
            message: 'Doc saved successfully! Would you like to open it now?',
            cancelText: 'Cancel',
            confirmText: 'Open',
          });
          if (open) {
            refNodeSlots?.docLinkClicked.next({
              pageId: docId,
              openMode: 'open-in-active-view',
              host: std.host,
            });
          }
        } else {
          toast(std.host, 'Failed to create document');
        }
      } catch (e) {
        console.error(e);
        toast(std.host, 'Failed to create document');
      }
    };

    const controls = html`
      <button class="doc-compose-result-save-as-doc" @click=${saveAsDoc}>
        ${PageIcon({
          width: '20',
          height: '20',
          style: `color: ${unsafeCSSVarV2('icon/primary')}`,
        })}
        Save as doc
      </button>
      <icon-button @click=${copyMarkdown} title="Copy markdown">
        ${CopyIcon({ width: '20', height: '20' })}
      </icon-button>
    `;

    renderPreviewPanel(
      this,
      html`<div class="doc-compose-result-preview">
        <div class="doc-compose-result-preview-title">${title}</div>
        ${successResult
          ? html`<text-renderer
              .answer=${successResult.markdown}
              .options=${{
                customHeading: true,
                extensions: getCustomPageEditorBlockSpecs(),
              }}
            ></text-renderer>`
          : html`<div class="doc-compose-result-preview-loading">
              ${LoadingIcon({
                size: '32px',
              })}
            </div>`}
      </div>`,
      composing ? undefined : controls
    );
  }

  protected override render() {
    if (!this.std) return nothing;
    const resultData = this.data;
    const composing = resultData.type === 'tool-call';

    const title = this.data.args.title;

    if (
      resultData.type === 'tool-result' &&
      resultData.result &&
      'type' in resultData.result &&
      resultData.result.type === 'error'
    ) {
      // failed
      return html`<tool-call-failed
        .name=${'Doc compose failed'}
        .icon=${ToolIcon()}
      ></tool-call-failed>`;
    }

    const { LinkedDocEmptyBanner } = getEmbedLinkedDocIcons(
      this.theme.value,
      'page',
      'horizontal'
    );

    return html`
      <div
        class="affine-embed-linked-doc-block doc-compose-result horizontal"
        @click=${this.updatePreviewPanel}
      >
        <div class="affine-embed-linked-doc-content">
          <div class="affine-embed-linked-doc-content-title">
            <div class="affine-embed-linked-doc-content-title-icon">
              ${composing
                ? LoadingIcon({
                    size: '20px',
                  })
                : PageIcon()}
            </div>
            <div class="affine-embed-linked-doc-content-title-text">
              ${title}
            </div>
          </div>
        </div>
        <div class="affine-embed-linked-doc-banner">
          ${LinkedDocEmptyBanner}
        </div>
      </div>
    `;
  }
}
