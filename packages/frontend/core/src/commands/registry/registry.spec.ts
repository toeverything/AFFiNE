/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { registerAffineCommand } from './registry';

const targets = {
  body: () => document.body,
  input: () => document.createElement('input'),
  textarea: () => document.createElement('textarea'),
  contenteditable: () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    return div;
  },
};

describe('Alt+KeyS command', () => {
  let unregister: (() => void) | undefined;

  afterEach(() => {
    unregister?.();
    document.body.innerHTML = '';
  });

  test.each([
    { key: 's', target: 'body', runs: true },
    { key: 's', target: 'contenteditable', runs: true },
    { key: 'ß', target: 'body', runs: true },
    { key: 'ś', target: 'body', runs: true },
    { key: 'ß', target: 'input', runs: false },
    { key: 'ś', target: 'textarea', runs: false },
    { key: 'ś', target: 'contenteditable', runs: false },
  ] as const)(
    'key "$key" on $target runs the command: $runs',
    ({ key, target, runs }) => {
      const run = vi.fn();
      unregister = registerAffineCommand({
        id: 'test:alt-s',
        label: 'test',
        icon: null,
        keyBinding: { binding: 'Alt+KeyS', capture: true },
        run,
      });
      const element = targets[target]();
      if (element !== document.body) {
        document.body.append(element);
      }

      const event = new KeyboardEvent('keydown', {
        key,
        code: 'KeyS',
        altKey: true,
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      element.dispatchEvent(event);

      expect(run).toHaveBeenCalledTimes(runs ? 1 : 0);
      expect(event.defaultPrevented).toBe(runs);
    }
  );
});
