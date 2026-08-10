import { describe, expect, test } from 'vitest';

import {
  isEditableScribbleTarget,
  PointerControl,
} from '../event/control/pointer.js';

describe('isEditableScribbleTarget', () => {
  test('detects native text inputs', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');

    expect(isEditableScribbleTarget(input)).toBe(true);
    expect(isEditableScribbleTarget(textarea)).toBe(true);
  });

  test('detects nested inline editor targets', () => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.dataset.vRoot = 'true';
    const child = document.createElement('span');
    editor.append(child);

    expect(isEditableScribbleTarget(child)).toBe(true);
  });

  test('ignores non-editable targets under an editable page root', () => {
    const pageRoot = document.createElement('div');
    pageRoot.contentEditable = 'true';
    const blockButton = document.createElement('button');
    pageRoot.append(blockButton);

    expect(isEditableScribbleTarget(blockButton)).toBe(false);
  });

  test('ignores non-editable targets', () => {
    expect(isEditableScribbleTarget(document.createElement('button'))).toBe(
      false
    );
    expect(isEditableScribbleTarget(null)).toBe(false);
  });
});

describe('PointerControl Scribble routing', () => {
  function setupPointerControl() {
    const host = document.createElement('div');
    (host as any).std = {
      dnd: {
        monitor: () => ({ dispose: () => {} }),
      },
    };
    const input = document.createElement('input');
    host.append(input);
    document.body.append(host);

    const dispatched: string[] = [];
    const control = new PointerControl({
      host,
      disposables: {
        addFromEvent: (
          target: EventTarget,
          type: string,
          listener: EventListener
        ) => {
          target.addEventListener(type, listener);
        },
        add: () => {},
      },
      run: (name: string) => {
        dispatched.push(name);
      },
    } as any);

    control.listen();
    return { dispatched, host, input };
  }

  test('does not dispatch synthetic pointer or click events for Pencil on editable Scribble targets', () => {
    const { dispatched, host, input } = setupPointerControl();

    input.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'pen',
        isPrimary: true,
      })
    );
    input.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'pen',
        isPrimary: true,
      })
    );

    expect(dispatched).toEqual([]);
    host.remove();
  });

  test('keeps synthetic pointer and click events for touch input on editable targets', () => {
    const { dispatched, host, input } = setupPointerControl();

    input.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      })
    );
    input.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      })
    );

    expect(dispatched).toEqual(['pointerDown', 'pointerUp', 'click']);
    host.remove();
  });
});
