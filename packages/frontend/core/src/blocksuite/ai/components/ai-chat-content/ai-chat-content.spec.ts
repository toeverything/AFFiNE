/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { AIProvider } from '../../provider';
import { AIChatContent } from './ai-chat-content';

const originalHistories = AIProvider.histories;

afterEach(() => {
  AIProvider.provide('histories', originalHistories as any);
});

describe('AIChatContent pinned scroll tracking', () => {
  test('records scroll position from the chat messages host', async () => {
    let scrollEndHandler: (() => void) | undefined;

    const chatMessages = {
      scrollTop: 256,
      updateComplete: Promise.resolve(),
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        if (event === 'scrollend') {
          scrollEndHandler = handler as () => void;
        }
      }),
    };

    const content = {
      chatMessagesRef: { value: chatMessages },
      _scrollListenersInitialized: false,
      lastScrollTop: undefined,
    } as unknown as AIChatContent;

    (AIChatContent.prototype as any)._initializeScrollListeners.call(content);
    await chatMessages.updateComplete;
    await Promise.resolve();

    expect(chatMessages.addEventListener).toHaveBeenCalledWith(
      'scrollend',
      expect.any(Function)
    );

    scrollEndHandler?.();

    expect((content as any).lastScrollTop).toBe(256);
  });
});

describe('AIChatContent history loading', () => {
  test('replaces messages when the active session changes', async () => {
    const histories = {
      chats: vi.fn(async (_workspaceId: string, sessionId: string) => [
        {
          messages: [
            {
              id: `${sessionId}-message`,
              role: 'user',
              content: sessionId,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ]),
      actions: vi.fn(async () => []),
      cleanup: vi.fn(),
      ids: vi.fn(),
    };
    AIProvider.provide('histories', histories as any);

    const content: {
      updateHistoryCounter: number;
      historyKey: string | undefined;
      workspaceId: string;
      docId: string;
      session: { sessionId: string };
      chatContextValue: { messages: unknown[]; status?: string };
      updateContext: (context: { messages: unknown[] }) => void;
    } = {
      updateHistoryCounter: 0,
      historyKey: undefined,
      workspaceId: 'ws-1',
      docId: 'doc-1',
      session: { sessionId: 'session-1' },
      chatContextValue: { messages: [] },
      updateContext(context: { messages: unknown[] }) {
        this.chatContextValue = {
          ...this.chatContextValue,
          ...context,
        };
      },
    };

    await (AIChatContent.prototype as any).updateHistory.call(content);
    expect(
      content.chatContextValue.messages.map((message: any) => message.id)
    ).toEqual(['session-1-message']);

    content.session = { sessionId: 'session-2' };
    await (AIChatContent.prototype as any).updateHistory.call(content);

    expect(
      content.chatContextValue.messages.map((message: any) => message.id)
    ).toEqual(['session-2-message']);
  });

  test('does not overwrite in-flight optimistic messages when a session is created', async () => {
    const histories = {
      chats: vi.fn(async () => [{ messages: [] }]),
      actions: vi.fn(async () => []),
      cleanup: vi.fn(),
      ids: vi.fn(),
    };
    AIProvider.provide('histories', histories as any);

    const optimisticMessages = [
      {
        id: '',
        role: 'user',
        content: 'hello',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '',
        role: 'assistant',
        content: '',
        createdAt: '2026-01-01T00:00:01.000Z',
      },
    ];
    const updateContext = vi.fn();
    const content = {
      updateHistoryCounter: 0,
      historyKey: 'ws-1:doc-1:',
      workspaceId: 'ws-1',
      docId: 'doc-1',
      session: { sessionId: 'session-1' },
      chatContextValue: {
        messages: optimisticMessages,
        status: 'loading',
      },
      updateContext,
    };

    await (AIChatContent.prototype as any).updateHistory.call(content);

    expect(updateContext).not.toHaveBeenCalled();
    expect(content.chatContextValue.messages).toBe(optimisticMessages);
  });
});
