import { describe, expect, test } from 'vitest';

import { bindKeymap } from '../event/keymap.js';

const createKeyboardEvent = (options: {
  key: string;
  keyCode: number;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key: options.key,
    altKey: options.altKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
  });

  Object.defineProperty(event, 'keyCode', {
    configurable: true,
    get: () => options.keyCode,
  });
  Object.defineProperty(event, 'which', {
    configurable: true,
    get: () => options.keyCode,
  });

  return event;
};

const createCtx = (event: KeyboardEvent) => {
  return {
    get(name: string) {
      if (name === 'keyboardState') {
        return { raw: event };
      }
      return undefined;
    },
  } as any;
};

describe('bindKeymap', () => {
  test('falls back to physical key for ctrl shortcuts on non-US layouts', () => {
    let handled = false;
    const handler = bindKeymap({
      'Ctrl-f': () => {
        handled = true;
        return true;
      },
    });

    const event = createKeyboardEvent({
      key: 'а',
      keyCode: 70,
      ctrlKey: true,
    });

    expect(handler(createCtx(event))).toBe(true);
    expect(handled).toBe(true);
  });

  test('does not fallback for Alt+locale-character letter input', () => {
    let handled = false;
    const handler = bindKeymap({
      'Alt-s': () => {
        handled = true;
        return true;
      },
    });

    const event = createKeyboardEvent({
      key: 'ś',
      keyCode: 83,
      altKey: true,
    });

    expect(handler(createCtx(event))).toBe(false);
    expect(handled).toBe(false);
  });

  test('keeps Alt+digit fallback for non-ASCII key outputs', () => {
    let handled = false;
    const handler = bindKeymap({
      'Alt-0': () => {
        handled = true;
        return true;
      },
    });

    const event = createKeyboardEvent({
      key: 'º',
      keyCode: 48,
      altKey: true,
    });

    expect(handler(createCtx(event))).toBe(true);
    expect(handled).toBe(true);
  });

  test('does not fallback on non-ASCII input without modifiers', () => {
    let handled = false;
    const handler = bindKeymap({
      '[': () => {
        handled = true;
        return true;
      },
    });

    const event = createKeyboardEvent({
      key: 'х',
      keyCode: 219,
    });

    expect(handler(createCtx(event))).toBe(false);
    expect(handled).toBe(false);
  });
});
