/**
 * @vitest-environment happy-dom
 */
import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ChatMessageUser } from '../../chat-panel/message/user';
import { AIChatErrorRenderer, AIErrorWrapper } from '../../messages/error';
import {
  SelectedSourcesLimitExceededError,
  SelectedSourcesProcessingError,
} from '../../provider/error';
import { ChatContentStreamObjects } from '../ai-message-content/stream-objects';
import { ToolFailedCard } from '../ai-tools/tool-failed-card';
import { ToolResultCard } from '../ai-tools/tool-result-card';
import { AIChatMessages } from './ai-chat-messages';

describe('AIChatMessages scrolling', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('scrollToEnd scrolls the host element', () => {
    const scrollTo = vi.fn();
    const element = {
      scrollTo,
    } as unknown as AIChatMessages;

    Object.defineProperty(element, 'scrollHeight', {
      configurable: true,
      value: 480,
    });

    AIChatMessages.prototype.scrollToEnd.call(element);

    expect(scrollTo).toHaveBeenCalledWith({
      top: 480,
      behavior: 'smooth',
    });
  });

  test('scrollToPos scrolls the host element', () => {
    const scrollTo = vi.fn();
    const element = {
      scrollTo,
    } as unknown as AIChatMessages;

    AIChatMessages.prototype.scrollToPos.call(element, 128);

    expect(scrollTo).toHaveBeenCalledWith({ top: 128 });
  });

  test('pauses auto scroll when user scrolls away from the bottom', () => {
    const element = {
      canScrollDown: false,
      scrollTop: 120,
      _autoScrollEnabled: true,
      _lastObservedScrollTop: 300,
      _getDistanceFromBottom: vi.fn(() => 260),
    } as unknown as AIChatMessages;

    (AIChatMessages.prototype as any)._onScroll.call(element);

    expect(element.canScrollDown).toBe(true);
    expect((element as any)._autoScrollEnabled).toBe(false);
    expect((element as any)._lastObservedScrollTop).toBe(120);
  });

  test('resumes auto scroll when user returns to the bottom', () => {
    const element = {
      canScrollDown: true,
      scrollTop: 420,
      _autoScrollEnabled: false,
      _lastObservedScrollTop: 120,
      _getDistanceFromBottom: vi.fn(() => 8),
    } as unknown as AIChatMessages;

    (AIChatMessages.prototype as any)._onScroll.call(element);

    expect(element.canScrollDown).toBe(false);
    expect((element as any)._autoScrollEnabled).toBe(true);
  });

  test('restores auto scroll when clicking the down indicator', () => {
    const scrollToEnd = vi.fn();
    const element = {
      canScrollDown: true,
      _autoScrollEnabled: false,
      scrollToEnd,
    } as unknown as AIChatMessages;

    (AIChatMessages.prototype as any)._onDownIndicatorClick.call(element);

    expect((element as any)._autoScrollEnabled).toBe(true);
    expect(element.canScrollDown).toBe(false);
    expect(scrollToEnd).toHaveBeenCalled();
  });

  test('message keys, scope receipts, and live reads render for the active chat', async () => {
    const element = {} as AIChatMessages;
    const message = {
      id: 'message-1',
      role: 'assistant',
      content: 'reply',
      createdAt: new Date().toISOString(),
    };

    element.runtimeSnapshot = {
      activeTabId: 'session-1',
    } as AIChatMessages['runtimeSnapshot'];
    const firstKey = (AIChatMessages.prototype as any)._getMessageKey.call(
      element,
      message,
      0
    );

    element.runtimeSnapshot = {
      activeTabId: 'session-2',
    } as AIChatMessages['runtimeSnapshot'];
    const secondKey = (AIChatMessages.prototype as any)._getMessageKey.call(
      element,
      message,
      0
    );

    expect(firstKey).toBe('session-1:message-1');
    expect(secondKey).toBe('session-2:message-1');

    if (!customElements.get('chat-message-user')) {
      customElements.define('chat-message-user', ChatMessageUser);
    }
    const userMessage = document.createElement('chat-message-user');
    userMessage.item = {
      id: 'user-message-1',
      role: 'user',
      content: 'question',
      createdAt: new Date().toISOString(),
      scopeSnapshot: {
        resolvedAt: '2026-08-08T10:00:00.000Z',
        selectors: [
          { kind: 'document', id: 'doc-1', name: 'Product notes' },
          { kind: 'artifact', id: 'artifact-1', name: 'brief.pdf' },
        ],
        requiredDocIds: ['doc-1'],
        requiredArtifactIds: ['artifact-1'],
      },
    };
    document.body.append(userMessage);
    await userMessage.updateComplete;
    expect(
      userMessage
        .querySelector('[data-testid="chat-scope-receipt"]')
        ?.textContent?.replace(/\s+/g, ' ')
    ).toContain('Product notes, brief.pdf · 2 sources');
    userMessage.remove();

    const userMessageWithoutReceipt =
      document.createElement('chat-message-user');
    userMessageWithoutReceipt.item = {
      id: 'user-message-2',
      role: 'user',
      content: 'new question',
      createdAt: new Date().toISOString(),
      scopeSnapshot: {
        resolvedAt: '2026-08-08T10:00:00.000Z',
        selectors: [],
        requiredDocIds: [],
        requiredArtifactIds: [],
      },
    };
    document.body.append(userMessageWithoutReceipt);
    await userMessageWithoutReceipt.updateComplete;
    expect(
      userMessageWithoutReceipt.querySelector('.scope-receipt')
    ).toBeNull();
    userMessageWithoutReceipt.remove();

    if (!customElements.get('tool-result-card')) {
      customElements.define('tool-result-card', ToolResultCard);
    }
    if (!customElements.get('tool-call-failed')) {
      customElements.define('tool-call-failed', ToolFailedCard);
    }
    if (!customElements.get('chat-content-stream-objects')) {
      customElements.define(
        'chat-content-stream-objects',
        ChatContentStreamObjects
      );
    }
    const liveRead = document.createElement(
      'chat-content-stream-objects'
    ) as ChatContentStreamObjects;
    liveRead.host = {
      std: { store: { meta: { title: 'Getting Started' } } },
    } as never;
    liveRead.answer = [
      {
        type: 'tool-result',
        toolCallId: 'call_provider_1',
        toolName: 'frontend_snapshot_document',
        args: { view: 'outline' },
        result: {
          editor_state_id: 'state-1',
          mode: 'page',
          outline: [
            {
              id: 'block-1',
              flavour: 'affine:paragraph',
              text: { content: 'Welcome to AFFiNE', truncated: false },
            },
          ],
          truncated: false,
        },
      },
      {
        type: 'tool-result',
        toolCallId: 'call_provider_2',
        toolName: 'frontend_snapshot_document',
        args: { view: 'outline' },
        result: {
          error: {
            code: 'VIEW_NOT_AVAILABLE',
            message: 'The requested live editor view is not available.',
            retryable: false,
          },
        },
      },
      {
        type: 'tool-result',
        toolCallId: 'call_provider_3',
        toolName: 'doc_canvas_read',
        args: { doc_id: 'doc-1', target: { kind: 'overview' } },
        result: {
          doc_id: 'doc-1',
          source: {
            type: 'document',
            workspace_id: 'workspace-1',
            doc_id: 'doc-1',
            title: 'Getting Started',
            visibility: 'edgeless',
          },
          counts: { blocks: 12, elements: 8 },
          blocks: [],
          elements: [],
        },
      },
      {
        type: 'tool-result',
        toolCallId: 'call_provider_2',
        toolName: 'frontend_snapshot_document',
        args: { view: 'outline' },
        result: {
          error: {
            code: 'VIEW_NOT_AVAILABLE',
            message: 'The requested live editor view is not available.',
            retryable: false,
          },
        },
      },
    ];
    document.body.append(liveRead);
    await liveRead.updateComplete;
    const resultCard =
      liveRead.querySelector<ToolResultCard>('tool-result-card');
    expect(resultCard?.name).toBe('Read outline of "Getting Started"');
    expect(resultCard?.results).toEqual([
      expect.objectContaining({
        title: 'Getting Started',
        content: 'Welcome to AFFiNE',
      }),
    ]);
    expect(
      liveRead.querySelector<ToolFailedCard>('tool-call-failed')?.name
    ).toBe('This view is not available in the current editor mode');
    expect(
      [...liveRead.querySelectorAll<ToolResultCard>('tool-result-card')].map(
        card => card.name
      )
    ).toContain('Read canvas of "Getting Started"');
    expect(
      liveRead.querySelector<HTMLDetailsElement>('.tool-group')?.open
    ).toBe(true);
    expect(
      liveRead.querySelector('.tool-group-summary')?.textContent
    ).toContain('3 actions · 1 failed');
    liveRead.remove();

    if (!customElements.get('ai-error-wrapper')) {
      customElements.define('ai-error-wrapper', AIErrorWrapper);
    }
    const retry = vi.fn();
    const errorContainer = document.createElement('div');
    document.body.append(errorContainer);
    render(
      AIChatErrorRenderer(
        new SelectedSourcesProcessingError('processing'),
        null,
        retry
      ),
      errorContainer
    );
    const error =
      errorContainer.querySelector<AIErrorWrapper>('ai-error-wrapper');
    await error?.updateComplete;
    expect(error?.text).toContain('still processing');
    expect(error?.actionTooltip).toBe('');
    error?.shadowRoot
      ?.querySelector<HTMLElement>('[data-testid="ai-error-action-button"]')
      ?.click();
    expect(retry).toHaveBeenCalledOnce();

    render(
      AIChatErrorRenderer(new SelectedSourcesProcessingError('processing')),
      errorContainer
    );
    const processingWithoutRetry =
      errorContainer.querySelector<AIErrorWrapper>('ai-error-wrapper');
    await processingWithoutRetry?.updateComplete;
    expect(processingWithoutRetry?.showAction).toBe(false);

    render(
      AIChatErrorRenderer(new SelectedSourcesLimitExceededError('limit')),
      errorContainer
    );
    const limitError =
      errorContainer.querySelector<AIErrorWrapper>('ai-error-wrapper');
    await limitError?.updateComplete;
    expect(limitError?.showAction).toBe(false);
    errorContainer.remove();
  });
});
