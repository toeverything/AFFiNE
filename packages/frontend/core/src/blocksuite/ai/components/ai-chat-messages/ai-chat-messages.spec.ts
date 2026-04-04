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
});
