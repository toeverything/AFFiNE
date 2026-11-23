import type { PeekViewService } from '@affine/core/modules/peek-view';
import { WithDisposable } from '@blocksuite/global/lit';
import { PageIcon, PenIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { Signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import type { DocDisplayConfig } from '../ai-chat-chips';
import type { ToolError } from './type';

type DocWriteToolName = 'doc_create' | 'doc_update' | 'doc_update_meta';

type DocWriteToolArgs = {
  doc_id?: string;
  title?: string;
  content?: string;
};

interface DocWriteToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: DocWriteToolName;
  args: DocWriteToolArgs;
}

interface DocWriteToolResult {
  type: 'tool-result';
  toolCallId: string;
  toolName: DocWriteToolName;
  args: DocWriteToolArgs;
  result:
    | {
        success?: boolean;
        docId?: string;
        message?: string;
      }
    | ToolError
    | null;
}

const isToolError = (result: unknown): result is ToolError =>
  !!result &&
  typeof result === 'object' &&
  'type' in result &&
  (result as ToolError).type === 'error';

export class DocWriteTool extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor data!: DocWriteToolCall | DocWriteToolResult;

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  @property({ attribute: false })
  accessor peekViewService!: PeekViewService;

  @property({ attribute: false })
  accessor docDisplayService!: DocDisplayConfig;

  @property({ attribute: false })
  accessor onOpenDoc!: (docId: string, sessionId?: string) => void;

  private getDocId() {
    const { data } = this;
    if (
      data.type === 'tool-result' &&
      data.result &&
      !isToolError(data.result)
    ) {
      const docId =
        typeof data.result.docId === 'string' ? data.result.docId : undefined;
      if (docId) return docId;
    }
    const docId = data.args.doc_id;
    return typeof docId === 'string' && docId.trim() ? docId : undefined;
  }

  private getDocTitle(docId?: string) {
    const { data } = this;
    if (data.toolName === 'doc_create' || data.toolName === 'doc_update_meta') {
      const title = data.args.title;
      if (title) return title;
    }
    if (docId && this.docDisplayService) {
      const title = this.docDisplayService.getTitle(docId);
      if (title) return title;
    }
    return undefined;
  }

  private getToolIcon() {
    return this.data.toolName === 'doc_create' ? PageIcon() : PenIcon();
  }

  private getCallLabel(title?: string) {
    switch (this.data.toolName) {
      case 'doc_create':
        return title ? `Creating "${title}"` : 'Creating document';
      case 'doc_update':
        return title ? `Updating "${title}"` : 'Updating document';
      case 'doc_update_meta':
        return title ? `Renaming to "${title}"` : 'Updating document title';
      default:
        return 'Updating document';
    }
  }

  private getResultLabel(title?: string) {
    switch (this.data.toolName) {
      case 'doc_create':
        return title ? `Created "${title}"` : 'Document created';
      case 'doc_update':
        return title ? `Updated "${title}"` : 'Document updated';
      case 'doc_update_meta':
        return title ? `Renamed "${title}"` : 'Document title updated';
      default:
        return 'Document updated';
    }
  }

  private openDoc(docId?: string) {
    if (!docId) return;
    if (this.peekViewService) {
      this.peekViewService.peekView
        .open({ type: 'doc', docRef: { docId } })
        .catch(console.error);
      return;
    }
    this.onOpenDoc?.(docId);
  }

  renderToolCall() {
    const docId = this.getDocId();
    const title = this.getDocTitle(docId);
    return html`<tool-call-card
      .name=${this.getCallLabel(title)}
      .icon=${this.getToolIcon()}
      .width=${this.width}
    ></tool-call-card>`;
  }

  renderToolResult() {
    if (this.data.type !== 'tool-result') {
      return nothing;
    }

    const result = this.data.result;
    if (!result || isToolError(result)) {
      const name = isToolError(result) ? result.name : 'Document action failed';
      return html`<tool-call-failed
        .name=${name}
        .icon=${this.getToolIcon()}
      ></tool-call-failed>`;
    }

    const docId = this.getDocId();
    const title = this.getDocTitle(docId) ?? 'Document';
    const parts: string[] = [];
    if (result.message) parts.push(result.message);
    if (docId) parts.push(`Doc ID: ${docId}`);
    const content = parts.length ? parts.join('\n') : undefined;

    return html`<tool-result-card
      .name=${this.getResultLabel(title)}
      .icon=${this.getToolIcon()}
      .width=${this.width}
      .results=${[
        {
          title,
          icon: PageIcon(),
          content,
          onClick: () => this.openDoc(docId),
        },
      ]}
    ></tool-result-card>`;
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

declare global {
  interface HTMLElementTagNameMap {
    'doc-write-tool': DocWriteTool;
  }
}
