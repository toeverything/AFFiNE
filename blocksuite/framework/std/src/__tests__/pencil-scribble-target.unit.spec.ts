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

  test('does not dispatch synthetic events for touch input on interactive targets', () => {
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

    expect(dispatched).toEqual([]);
    host.remove();
  });

  test('does not start a drag when Pencil taps an edgeless toolbar button', () => {
    const { dispatched, host } = setupPointerControl();
    const button = document.createElement('edgeless-tool-icon-button');
    host.append(button);

    button.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 2,
        pointerType: 'pen',
        isPrimary: true,
        clientX: 10,
        clientY: 10,
      })
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 2,
        pointerType: 'pen',
        isPrimary: true,
        clientX: 80,
        clientY: 80,
      })
    );
    document.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 2,
        pointerType: 'pen',
        isPrimary: true,
        clientX: 80,
        clientY: 80,
      })
    );

    expect(dispatched).not.toContain('dragStart');
    host.remove();
  });

  test('does not dispatch canvas events when Pencil taps edgeless chrome wrappers', () => {
    const { dispatched, host } = setupPointerControl();
    const toolbar = document.createElement('edgeless-toolbar-widget');
    const toolbarContainer = document.createElement('div');
    toolbarContainer.className = 'edgeless-toolbar-container';
    toolbar.append(toolbarContainer);
    host.append(toolbar);

    toolbarContainer.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 3,
        pointerType: 'pen',
        isPrimary: true,
        clientX: 10,
        clientY: 10,
      })
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 3,
        pointerType: 'pen',
        isPrimary: true,
        clientX: 80,
        clientY: 80,
      })
    );
    toolbarContainer.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 3,
        pointerType: 'pen',
        isPrimary: true,
        clientX: 80,
        clientY: 80,
      })
    );

    expect(dispatched).toEqual([]);
    host.remove();
  });

  test('keeps UI pointer handlers available while suppressing canvas events', () => {
    const { dispatched, host } = setupPointerControl();
    const entry = document.createElement('div');
    entry.role = 'button';
    host.append(entry);
    let uiPointerDownCount = 0;
    entry.addEventListener('pointerdown', () => {
      uiPointerDownCount++;
    });

    const event = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 4,
      pointerType: 'pen',
      isPrimary: true,
    });
    entry.dispatchEvent(event);
    entry.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 4,
        pointerType: 'pen',
        isPrimary: true,
      })
    );

    expect(uiPointerDownCount).toBe(1);
    expect(event.defaultPrevented).toBe(false);
    expect(dispatched).toEqual([]);
    host.remove();
  });

  test('does not dispatch canvas events from mobile detail header chrome gaps', () => {
    const { dispatched, host } = setupPointerControl();
    const header = document.createElement('div');
    header.dataset.affineEdgelessUiChrome = 'true';
    const suffixGap = document.createElement('span');
    header.append(suffixGap);
    host.append(header);

    suffixGap.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 5,
        pointerType: 'pen',
        isPrimary: true,
        clientX: 1140,
        clientY: 58,
      })
    );
    suffixGap.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 5,
        pointerType: 'pen',
        isPrimary: true,
        clientX: 1140,
        clientY: 58,
      })
    );

    expect(dispatched).toEqual([]);
    host.remove();
  });
});
