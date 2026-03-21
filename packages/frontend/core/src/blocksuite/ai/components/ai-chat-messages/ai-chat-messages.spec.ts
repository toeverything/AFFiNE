/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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
});
