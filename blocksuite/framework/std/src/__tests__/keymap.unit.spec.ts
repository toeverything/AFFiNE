import { describe, expect, test, vi } from 'vitest';

import { UIEventState, UIEventStateContext } from '../event/base.js';
import { androidBindKeymapPatch, bindKeymap } from '../event/keymap.js';

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

describe('androidBindKeymapPatch', () => {
  const beforeInputCtx = (inputType: string) => {
    const event = new InputEvent('beforeinput', {
      inputType,
      cancelable: true,
    });
    return { ctx: UIEventStateContext.from(new UIEventState(event)), event };
  };

  test('routes deleteContentBackward to the Backspace binding', () => {
    const backspace = vi.fn(() => true);
    const handler = androidBindKeymapPatch({ Backspace: backspace });
    const { ctx } = beforeInputCtx('deleteContentBackward');

    expect(handler(ctx)).toBe(true);
    expect(backspace).toHaveBeenCalledOnce();
  });

  test('routes insertParagraph to the Enter binding', () => {
    const enter = vi.fn((ctx: UIEventStateContext) => {
      ctx.get('keyboardState').raw.preventDefault();
      return true;
    });
    const handler = androidBindKeymapPatch({ Enter: enter });
    const { ctx, event } = beforeInputCtx('insertParagraph');
    const preventDefault = vi.spyOn(event, 'preventDefault');

    expect(handler(ctx)).toBe(true);
    expect(enter).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(ctx.get('keyboardState').raw.key).toBe('Enter');
    expect(ctx.get('keyboardState').composing).toBe(false);
  });

  test('propagates preventDefault when the binding returns false', () => {
    const backspace = vi.fn((ctx: UIEventStateContext) => {
      ctx.get('keyboardState').raw.preventDefault();
      return false;
    });
    const handler = androidBindKeymapPatch({ Backspace: backspace });
    const { ctx, event } = beforeInputCtx('deleteContentBackward');

    expect(handler(ctx)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  test('does nothing for insertParagraph without an Enter binding', () => {
    const handler = androidBindKeymapPatch({ Backspace: vi.fn(() => true) });
    const { ctx } = beforeInputCtx('insertParagraph');

    expect(handler(ctx)).toBe(false);
    expect(ctx.has('keyboardState')).toBe(false);
  });

  test('ignores non-input events', () => {
    const enter = vi.fn(() => true);
    const backspace = vi.fn(() => true);
    const ctx = UIEventStateContext.from(
      new UIEventState(new KeyboardEvent('keydown', { key: 'Enter' }))
    );

    expect(
      androidBindKeymapPatch({ Enter: enter, Backspace: backspace })(ctx)
    ).toBeUndefined();
    expect(enter).not.toHaveBeenCalled();
    expect(backspace).not.toHaveBeenCalled();
  });

  test('ignores unrelated input types', () => {
    const enter = vi.fn(() => true);
    const backspace = vi.fn(() => true);
    const handler = androidBindKeymapPatch({
      Enter: enter,
      Backspace: backspace,
    });
    const { ctx } = beforeInputCtx('insertText');

    expect(handler(ctx)).toBe(false);
    expect(enter).not.toHaveBeenCalled();
    expect(backspace).not.toHaveBeenCalled();
  });
});
