/**
 * @vitest-environment happy-dom
 */
import { describe, expect, test, vi } from 'vitest';

import { AIChatContent } from './ai-chat-content';

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
