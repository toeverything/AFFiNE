import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { PeekViewService } from '@affine/core/modules/peek-view';
import { I18n } from '@affine/i18n';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import type { ColorScheme } from '@blocksuite/affine/model';
import {
  type BlockStdScope,
  type EditorHost,
  ShadowlessElement,
} from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import type { NotificationService } from '@blocksuite/affine-shared/services';
import {
  EdgelessIcon,
  PageIcon,
  ToggleDownIcon,
  ToolIcon,
  ViewIcon,
} from '@blocksuite/icons/lit';
import type { Signal } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import type { AffineAIPanelState } from '../../widgets/ai-panel/type';
import type { DocDisplayConfig } from '../ai-chat-chips';
import type { StreamObject } from '../ai-chat-messages';

const frontendReadTools = new Set([
  'frontend_get_editor_state',
  'frontend_read_selection',
  'frontend_read_nodes',
  'frontend_snapshot_document',
]);

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function projectedText(value: unknown): string | undefined {
  const item = object(value);
  const projected = object(item?.value) ?? item;
  const text = projected?.text;
  if (typeof text === 'string') return text;
  const content = object(text)?.content;
  if (typeof content === 'string') return content;
  const title = projected?.title;
  if (typeof title === 'string') return title;
  const titleContent = object(title)?.content;
  return typeof titleContent === 'string' ? titleContent : undefined;
}

function frontendReadPreview(result: unknown) {
  const value = object(result);
  if (!value) return undefined;
  const viewport = object(value.viewport);
  const items = [
    value.outline,
    value.selection_neighborhood,
    value.items,
    value.nodes,
    value.blocks,
    value.elements,
    viewport?.elements,
  ].find((item): item is unknown[] => Array.isArray(item) && item.length > 0);
  const preview = items
    ?.map(projectedText)
    .filter((text): text is string => !!text)
    .slice(0, 4)
    .join('\n');
  if (preview) return preview;
  return typeof value.mode === 'string'
    ? I18n['com.affine.ai.chat-panel.tool.live.mode']({ mode: value.mode })
    : undefined;
}

function frontendReadError(result: Record<string, unknown>) {
  const error = object(result.error);
  if (error?.code === 'VIEW_NOT_AVAILABLE') {
    return I18n['com.affine.ai.chat-panel.tool.live.view-unavailable']();
  }
  if (typeof error?.message === 'string') return error.message;
  if (typeof result.message === 'string') return result.message;
  return I18n['com.affine.ai.chat-panel.tool.live.failed']();
}

function canvasReadPreview(result: Record<string, unknown>) {
  const preview = frontendReadPreview(result);
  if (preview) return preview;
  const counts = object(result.counts);
  const parts: string[] = [];
  if (typeof counts?.blocks === 'number') {
    parts.push(
      I18n['com.affine.ai.chat-panel.tool.live.blocks']({
        count: String(counts.blocks),
      })
    );
  }
  if (typeof counts?.elements === 'number') {
    parts.push(
      I18n['com.affine.ai.chat-panel.tool.live.elements']({
        count: String(counts.elements),
      })
    );
  }
  return parts.join(' · ') || undefined;
}

type ToolStreamObject = Extract<
  StreamObject,
  { type: 'tool-call' | 'tool-result' }
>;

function isToolObject(value: StreamObject): value is ToolStreamObject {
  return value.type === 'tool-call' || value.type === 'tool-result';
}

function toolFailed(value: StreamObject) {
  if (value.type !== 'tool-result') return false;
  const result = object(value.result);
  return !result || !!result.error || result.type === 'error';
}

type StreamGroup =
  | { type: 'item'; item: StreamObject }
  | { type: 'tools'; items: ToolStreamObject[]; key: string };

function groupStreamObjects(answer: StreamObject[]): StreamGroup[] {
  const groups: StreamGroup[] = [];
  for (let index = 0; index < answer.length;) {
    if (!isToolObject(answer[index])) {
      groups.push({ type: 'item', item: answer[index] });
      index += 1;
      continue;
    }
    const items: ToolStreamObject[] = [];
    while (index < answer.length) {
      const item = answer[index];
      if (!isToolObject(item)) break;
      items.push(item);
      index += 1;
    }
    const callIds = [...new Set(items.map(item => item.toolCallId))];
    if (callIds.length < 3) {
      groups.push(...items.map(item => ({ type: 'item' as const, item })));
      continue;
    }
    groups.push({ type: 'tools', items, key: callIds.join(':') });
  }
  return groups;
}

export class ChatContentStreamObjects extends WithDisposable(
  ShadowlessElement
) {
  static override styles = css`
    .reasoning-wrapper {
      padding: 16px 20px;
      margin: 8px 0;
      border-radius: 8px;
      background-color: rgba(0, 0, 0, 0.05);
    }

    .tool-group {
      margin: 8px 0;
      border: 0.5px solid var(--affine-border-color);
      border-radius: 8px;
      overflow: hidden;
    }

    .tool-group-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      color: var(--affine-text-secondary-color);
      cursor: pointer;
      list-style: none;
      user-select: none;
    }

    .tool-group-summary::-webkit-details-marker {
      display: none;
    }

    .tool-group-summary:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -2px;
    }

    .tool-group-icon,
    .tool-group-toggle {
      display: flex;
      width: 24px;
      height: 24px;
      align-items: center;
      justify-content: center;
    }

    .tool-group-icon svg,
    .tool-group-toggle svg {
      width: 24px;
      height: 24px;
    }

    .tool-group-title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 500;
      line-height: 24px;
    }

    .tool-group-toggle {
      transition: transform 0.23s ease;
      transform: rotate(-90deg);
    }

    .tool-group[open] .tool-group-toggle {
      transform: rotate(0deg);
    }

    .tool-group-content {
      border-top: 0.5px solid var(--affine-border-color);
    }

    .tool-group-content .ai-tool-call-wrapper,
    .tool-group-content .ai-tool-result-wrapper,
    .tool-group-content .ai-tool-failed-wrapper {
      margin: 0;
      border: 0;
      border-bottom: 0.5px solid var(--affine-border-color);
      border-radius: 0;
    }

    .tool-group-content > :last-child .ai-tool-call-wrapper,
    .tool-group-content > :last-child .ai-tool-result-wrapper,
    .tool-group-content > :last-child .ai-tool-failed-wrapper {
      border-bottom: 0;
    }

    .tool-group.failed > .tool-group-summary {
      color: var(--affine-error-color);
    }

    @media (prefers-reduced-motion: reduce) {
      .tool-group-toggle {
        transition: none;
      }
    }
  `;

  @property({ attribute: false })
  accessor answer!: StreamObject[];

  @property({ attribute: false })
  accessor host: EditorHost | null | undefined;

  @property({ attribute: false })
  accessor std: BlockStdScope | null | undefined;

  @property({ attribute: false })
  accessor state: AffineAIPanelState = 'finished';

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  @property({ attribute: false })
  accessor extensions!: ExtensionType[];

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor theme!: Signal<ColorScheme>;

  @property({ attribute: false })
  accessor independentMode: boolean | undefined;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @property({ attribute: false })
  accessor docDisplayService!: DocDisplayConfig;

  @property({ attribute: false })
  accessor peekViewService!: PeekViewService;

  @property({ attribute: false })
  accessor onOpenDoc!: (docId: string, sessionId?: string) => void;

  @state()
  private accessor toolGroupOverrides = new Map<string, boolean>();

  private renderFrontendRead(streamObject: StreamObject) {
    if (
      (streamObject.type !== 'tool-call' &&
        streamObject.type !== 'tool-result') ||
      !frontendReadTools.has(streamObject.toolName)
    ) {
      return nothing;
    }
    const title =
      this.host?.std.store.meta?.title ||
      I18n['com.affine.ai.chat-panel.tool.live.current-document']();
    const result =
      streamObject.type === 'tool-result'
        ? object(streamObject.result)
        : undefined;
    const isCanvasSnapshot =
      streamObject.toolName === 'frontend_snapshot_document' &&
      (!!object(result?.viewport) ||
        object(streamObject.args)?.view === 'viewport');
    const labels = {
      frontend_get_editor_state: [
        I18n['com.affine.ai.chat-panel.tool.live.state-checking'](),
        I18n['com.affine.ai.chat-panel.tool.live.state-checked'](),
      ],
      frontend_read_selection: [
        I18n['com.affine.ai.chat-panel.tool.live.selection-reading'](),
        I18n['com.affine.ai.chat-panel.tool.live.selection-read'](),
      ],
      frontend_read_nodes: [
        I18n['com.affine.ai.chat-panel.tool.live.content-reading'](),
        I18n['com.affine.ai.chat-panel.tool.live.content-read'](),
      ],
      frontend_snapshot_document: [
        isCanvasSnapshot
          ? I18n['com.affine.ai.chat-panel.tool.live.canvas-reading']({ title })
          : I18n['com.affine.ai.chat-panel.tool.live.outline-reading']({
              title,
            }),
        isCanvasSnapshot
          ? I18n['com.affine.ai.chat-panel.tool.live.canvas-read']({ title })
          : I18n['com.affine.ai.chat-panel.tool.live.outline-read']({ title }),
      ],
    } as const;
    const [callLabel, resultLabel] =
      labels[streamObject.toolName as keyof typeof labels];
    if (streamObject.type === 'tool-call') {
      return html`<tool-call-card
        .name=${callLabel}
        .icon=${ViewIcon()}
        .width=${this.width}
      ></tool-call-card>`;
    }
    if (!result || result.error || result.type === 'error') {
      return html`<tool-call-failed
        .name=${
          result
            ? frontendReadError(result)
            : I18n['com.affine.ai.chat-panel.tool.live.failed']()
        }
        .icon=${ViewIcon()}
      ></tool-call-failed>`;
    }
    return html`<tool-result-card
      .name=${resultLabel}
      .icon=${ViewIcon()}
      .width=${this.width}
      .results=${[
        {
          title:
            streamObject.toolName === 'frontend_snapshot_document'
              ? title
              : resultLabel,
          icon: PageIcon(),
          content: frontendReadPreview(result),
        },
      ]}
    ></tool-result-card>`;
  }

  private renderCanvasRead(streamObject: StreamObject) {
    if (
      (streamObject.type !== 'tool-call' &&
        streamObject.type !== 'tool-result') ||
      streamObject.toolName !== 'doc_canvas_read'
    ) {
      return nothing;
    }
    if (streamObject.type === 'tool-call') {
      return html`<tool-call-card
        .name=${I18n['com.affine.ai.chat-panel.tool.canvas.reading']()}
        .icon=${ViewIcon()}
        .width=${this.width}
      ></tool-call-card>`;
    }
    const result = object(streamObject.result);
    if (!result || result.error || result.type === 'error') {
      return html`<tool-call-failed
        .name=${
          result
            ? frontendReadError(result)
            : I18n['com.affine.ai.chat-panel.tool.canvas.failed']()
        }
        .icon=${ViewIcon()}
      ></tool-call-failed>`;
    }
    const title = object(result.source)?.title;
    const name =
      typeof title === 'string'
        ? I18n['com.affine.ai.chat-panel.tool.canvas.read']({ title })
        : I18n['com.affine.ai.chat-panel.tool.canvas.read-untitled']();
    return html`<tool-result-card
      .name=${name}
      .icon=${ViewIcon()}
      .width=${this.width}
      .results=${[
        {
          title:
            typeof title === 'string'
              ? title
              : I18n['com.affine.ai.chat-panel.tool.canvas.content'](),
          icon: EdgelessIcon(),
          content: canvasReadPreview(result),
        },
      ]}
    ></tool-result-card>`;
  }

  private renderToolCall(streamObject: StreamObject) {
    if (streamObject.type !== 'tool-call') {
      return nothing;
    }

    if (frontendReadTools.has(streamObject.toolName)) {
      return this.renderFrontendRead(streamObject);
    }
    if (streamObject.toolName === 'doc_canvas_read') {
      return this.renderCanvasRead(streamObject);
    }

    switch (streamObject.toolName) {
      case 'web_crawl_exa':
        return html`
          <web-crawl-tool
            .data=${streamObject}
            .width=${this.width}
          ></web-crawl-tool>
        `;
      case 'web_search_exa':
        return html`
          <web-search-tool
            .data=${streamObject}
            .width=${this.width}
          ></web-search-tool>
        `;
      case 'doc_compose':
        return html`
          <doc-compose-tool
            .std=${this.std || this.host?.std}
            .data=${streamObject}
            .width=${this.width}
            .theme=${this.theme}
            .notificationService=${this.notificationService}
          ></doc-compose-tool>
        `;
      case 'code_artifact':
        return html`
          <code-artifact-tool
            .std=${this.std || this.host?.std}
            .data=${streamObject}
            .width=${this.width}
            .theme=${this.theme}
          ></code-artifact-tool>
        `;
      case 'doc_edit':
        return html`
          <doc-edit-tool
            .data=${streamObject}
            .doc=${this.host?.store}
            .notificationService=${this.notificationService}
          ></doc-edit-tool>
        `;
      case 'doc_semantic_search':
        return html`<doc-semantic-search-result
          .data=${streamObject}
          .width=${this.width}
          .peekViewService=${this.peekViewService}
        ></doc-semantic-search-result>`;
      case 'doc_keyword_search':
      case 'doc_search':
        return html`<doc-keyword-search-result
          .data=${streamObject}
          .width=${this.width}
        ></doc-keyword-search-result>`;
      case 'doc_read':
        return html`<doc-read-result
          .data=${streamObject}
          .width=${this.width}
        ></doc-read-result>`;
      case 'doc_create':
      case 'doc_update':
      case 'doc_update_meta':
        return html`<doc-write-tool
          .data=${streamObject}
          .width=${this.width}
          .peekViewService=${this.peekViewService}
          .docDisplayService=${this.docDisplayService}
          .onOpenDoc=${this.onOpenDoc}
        ></doc-write-tool>`;
      case 'section_edit':
        return html`
          <section-edit-tool
            .data=${streamObject}
            .extensions=${this.extensions}
            .affineFeatureFlagService=${this.affineFeatureFlagService}
            .notificationService=${this.notificationService}
            .theme=${this.theme}
            .host=${this.host}
            .independentMode=${this.independentMode}
          ></section-edit-tool>
        `;
      default: {
        const name = streamObject.toolName + ' tool calling';
        return html`
          <tool-call-card .name=${name} .width=${this.width}></tool-call-card>
        `;
      }
    }
  }

  private renderToolResult(streamObject: StreamObject) {
    if (streamObject.type !== 'tool-result') {
      return nothing;
    }

    if (frontendReadTools.has(streamObject.toolName)) {
      return this.renderFrontendRead(streamObject);
    }
    if (streamObject.toolName === 'doc_canvas_read') {
      return this.renderCanvasRead(streamObject);
    }

    switch (streamObject.toolName) {
      case 'web_crawl_exa':
        return html`
          <web-crawl-tool
            .data=${streamObject}
            .width=${this.width}
          ></web-crawl-tool>
        `;
      case 'web_search_exa':
        return html`
          <web-search-tool
            .data=${streamObject}
            .width=${this.width}
          ></web-search-tool>
        `;
      case 'doc_compose':
        return html`
          <doc-compose-tool
            .std=${this.std || this.host?.std}
            .data=${streamObject}
            .width=${this.width}
            .theme=${this.theme}
            .notificationService=${this.notificationService}
          ></doc-compose-tool>
        `;
      case 'code_artifact':
        return html`
          <code-artifact-tool
            .std=${this.std || this.host?.std}
            .data=${streamObject}
            .width=${this.width}
            .theme=${this.theme}
            .notificationService=${this.notificationService}
          ></code-artifact-tool>
        `;
      case 'doc_edit':
        return html`
          <doc-edit-tool
            .data=${streamObject}
            .host=${this.host}
            .renderRichText=${this.renderRichText.bind(this)}
            .notificationService=${this.notificationService}
          ></doc-edit-tool>
        `;
      case 'doc_semantic_search':
        return html`<doc-semantic-search-result
          .data=${streamObject}
          .width=${this.width}
          .docDisplayService=${this.docDisplayService}
          .peekViewService=${this.peekViewService}
          .onOpenDoc=${this.onOpenDoc}
        ></doc-semantic-search-result>`;
      case 'doc_keyword_search':
      case 'doc_search':
        return html`<doc-keyword-search-result
          .data=${streamObject}
          .width=${this.width}
          .peekViewService=${this.peekViewService}
          .onOpenDoc=${this.onOpenDoc}
        ></doc-keyword-search-result>`;
      case 'doc_read':
        return html`<doc-read-result
          .data=${streamObject}
          .width=${this.width}
          .peekViewService=${this.peekViewService}
          .onOpenDoc=${this.onOpenDoc}
        ></doc-read-result>`;
      case 'doc_create':
      case 'doc_update':
      case 'doc_update_meta':
        return html`<doc-write-tool
          .data=${streamObject}
          .width=${this.width}
          .peekViewService=${this.peekViewService}
          .docDisplayService=${this.docDisplayService}
          .onOpenDoc=${this.onOpenDoc}
        ></doc-write-tool>`;
      case 'section_edit':
        return html`
          <section-edit-tool
            .data=${streamObject}
            .extensions=${this.extensions}
            .affineFeatureFlagService=${this.affineFeatureFlagService}
            .notificationService=${this.notificationService}
            .theme=${this.theme}
            .host=${this.host}
            .independentMode=${this.independentMode}
          ></section-edit-tool>
        `;
      default: {
        const name = streamObject.toolName + ' tool result';
        return html`
          <tool-result-card
            .name=${name}
            .width=${this.width}
          ></tool-result-card>
        `;
      }
    }
  }

  private renderRichText(text: string) {
    return html`<chat-content-rich-text
      .text=${text}
      .state=${this.state}
      .extensions=${this.extensions}
      .affineFeatureFlagService=${this.affineFeatureFlagService}
      .theme=${this.theme}
    ></chat-content-rich-text>`;
  }

  private renderStreamObject(data: StreamObject) {
    switch (data.type) {
      case 'text-delta':
        return this.renderRichText(data.textDelta);
      case 'reasoning':
        return html`
          <div class="reasoning-wrapper">
            ${this.renderRichText(data.textDelta)}
          </div>
        `;
      case 'tool-call':
        return this.renderToolCall(data);
      case 'tool-result':
        return this.renderToolResult(data);
    }
  }

  private renderToolGroup(group: Extract<StreamGroup, { type: 'tools' }>) {
    const callCount = new Set(group.items.map(item => item.toolCallId)).size;
    const failedCount = new Set(
      group.items.filter(toolFailed).map(item => item.toolCallId)
    ).size;
    const defaultOpen = this.state !== 'finished' || failedCount > 0;
    const open = this.toolGroupOverrides.get(group.key) ?? defaultOpen;
    const title = failedCount
      ? I18n['com.affine.ai.chat-panel.tool-group.failed']({
          count: String(callCount),
          failed: String(failedCount),
        })
      : this.state === 'finished'
        ? I18n['com.affine.ai.chat-panel.tool-group.completed']({
            count: String(callCount),
          })
        : I18n['com.affine.ai.chat-panel.tool-group.running']({
            count: String(callCount),
          });
    return html`<details
      class=${classMap({ 'tool-group': true, failed: failedCount > 0 })}
      .open=${open}
      @toggle=${(event: Event) => {
        const details = event.currentTarget as HTMLDetailsElement;
        if (details.open === open) return;
        this.toolGroupOverrides = new Map(this.toolGroupOverrides).set(
          group.key,
          details.open
        );
      }}
    >
      <summary class="tool-group-summary">
        <span class="tool-group-icon">${ToolIcon()}</span>
        <span class="tool-group-title">${title}</span>
        <span class="tool-group-toggle">${ToggleDownIcon()}</span>
      </summary>
      <div class="tool-group-content">
        ${group.items.map(item => this.renderStreamObject(item))}
      </div>
    </details>`;
  }

  protected override render() {
    return html`<div>
      ${groupStreamObjects(this.answer).map(group =>
        group.type === 'tools'
          ? this.renderToolGroup(group)
          : this.renderStreamObject(group.item)
      )}
    </div>`;
  }
}
