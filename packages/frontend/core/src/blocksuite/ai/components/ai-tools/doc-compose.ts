import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { getAFFiNEWorkspaceSchema } from '@affine/core/modules/workspace';
import { getEmbedLinkedDocIcons } from '@blocksuite/affine/blocks/embed-doc';
import { DocIcon } from '@blocksuite/affine/components/icons';
import { toast } from '@blocksuite/affine/components/toast';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { RefNodeSlotsProvider } from '@blocksuite/affine/inlines/reference';
import type { ImageProxyService } from '@blocksuite/affine/shared/adapters';
import {
  NotificationProvider,
  ThemeProvider,
} from '@blocksuite/affine/shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { type BlockStdScope, ShadowlessElement } from '@blocksuite/affine/std';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { CopyIcon, PageIcon, ToolIcon } from '@blocksuite/icons/lit';
import type { Signal } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import { getCustomPageEditorBlockSpecs } from '../text-renderer';
import {
  closePreviewPanel,
  isPreviewPanelOpen,
  renderPreviewPanel,
} from './artifacts';
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
        metadata: Record<string, unknown>;
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

    .doc-compose-result-save-as-doc:hover {
      background: ${unsafeCSSVarV2('switch/buttonBackground/hover')};
    }
  `;

  @property({ attribute: false })
  accessor data!: DocComposeToolCall | DocComposeToolResult;

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  @property({ attribute: false })
  accessor imageProxyService: ImageProxyService | null | undefined;

  @property({ attribute: false })
  accessor std: BlockStdScope | undefined;

  private renderToolCall() {
    const { args } = this.data as DocComposeToolCall;
    const name = `Composing document "${args.title}"`;
    return html`<tool-call-card
      .name=${name}
      .icon=${ToolIcon()}
    ></tool-call-card>`;
  }

  private renderToolResult() {
    if (!this.std) return nothing;
    if (this.data.type !== 'tool-result') return nothing;
    const std = this.std;
    const resultData = this.data as DocComposeToolResult;
    const result = resultData.result;

    if (result && typeof result === 'object' && 'title' in result) {
      const { title } = result as { title: string };

      const theme = this.std.get(ThemeProvider).theme;

      const { LinkedDocEmptyBanner } = getEmbedLinkedDocIcons(
        theme,
        'page',
        'horizontal'
      );

      const onClick = () => {
        if (isPreviewPanelOpen(this)) {
          closePreviewPanel(this);
          return;
        }

        const copyMarkdown = async () => {
          await navigator.clipboard
            .writeText(result.markdown)
            .catch(console.error);
          toast(std.host, 'Copied markdown to clipboard');
        };

        const saveAsDoc = async () => {
          try {
            const workspace = std.store.workspace;
            const notificationService = std.get(NotificationProvider);
            const refNodeSlots = std.getOptional(RefNodeSlotsProvider);
            const docId = await MarkdownTransformer.importMarkdownToDoc({
              collection: workspace,
              schema: getAFFiNEWorkspaceSchema(),
              markdown: result.markdown,
              fileName: title,
              extensions: getStoreManager().config.init().value.get('store'),
            });
            if (docId) {
              const open = await notificationService.confirm({
                title: 'Open the doc you just created',
                message:
                  'Doc saved successfully! Would you like to open it now?',
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
            <text-renderer
              .answer=${result.markdown}
              .host=${std.host}
              .schema=${std.store.schema}
              .options=${{
                customHeading: true,
                extensions: getCustomPageEditorBlockSpecs(),
              }}
            ></text-renderer>
          </div>`,
          controls
        );
      };

      return html`
        <div
          class="affine-embed-linked-doc-block doc-compose-result horizontal"
          @click=${onClick}
        >
          <div class="affine-embed-linked-doc-content">
            <div class="affine-embed-linked-doc-content-title">
              <div class="affine-embed-linked-doc-content-title-icon">
                ${DocIcon}
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

    // failed
    return html`<tool-call-failed
      .name=${'Doc compose failed'}
      .icon=${ToolIcon()}
    ></tool-call-failed>`;
  }

  protected override render() {
    if (this.data.type === 'tool-call') {
      return this.renderToolCall();
    }
    if (this.data.type === 'tool-result') {
      return this.renderToolResult();
    }
    return nothing;
  }
}
