/**
 * @vitest-environment happy-dom
 */
import { ToggleSwitch } from '@blocksuite/affine-components/toggle-switch';
import { EditorMenuAction } from '@blocksuite/affine-components/toolbar';
import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { toggleGroup } from '../../../blocks/code/src/code-toolbar/config.js';

type ToggleType = 'line-number' | 'wrap';

function renderToggleItem(type: ToggleType) {
  const toggle = vi.fn();
  const blockComponent =
    type === 'wrap'
      ? { model: { props: { wrap: false } }, setWrap: toggle }
      : {
          model: {},
          showLineNumbers: false,
          store: { updateBlock: toggle },
        };
  const item = toggleGroup.items.find(item => item.type === type);
  if (!item || !('generate' in item) || !item.generate) {
    throw new Error(`${type} toolbar item is missing a generate function`);
  }
  // only the block component is read by these items
  const generated = item.generate({ blockComponent } as never) as unknown as {
    render: () => unknown;
  };
  const container = document.createElement('div');
  render(generated.render() as never, container);
  return { container, toggle };
}

describe.each<ToggleType>(['wrap', 'line-number'])(
  'code block %s toggle',
  type => {
    beforeEach(() => {
      if (!customElements.get('editor-menu-action')) {
        customElements.define('editor-menu-action', EditorMenuAction);
      }
      if (!customElements.get('toggle-switch')) {
        customElements.define('toggle-switch', ToggleSwitch);
      }
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('clicking the switch does not toggle through the row as well', () => {
      const { container, toggle } = renderToggleItem(type);

      const row = container.querySelector('editor-menu-action');
      const switchEl = container.querySelector('toggle-switch');
      expect(row).not.toBeNull();
      expect(switchEl).not.toBeNull();

      // the switch reports its own state through onChange, so the click must
      // not bubble up to the row that toggles the same setting a second time
      switchEl!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, composed: true })
      );

      expect(toggle).not.toHaveBeenCalled();
    });

    test('clicking the row still toggles once', () => {
      const { container, toggle } = renderToggleItem(type);

      const row = container.querySelector('editor-menu-action');
      expect(row).not.toBeNull();

      row!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, composed: true })
      );

      expect(toggle).toHaveBeenCalledTimes(1);
    });
  }
);

test('the switch reports the current wrap state', () => {
  const { container } = renderToggleItem('wrap');
  const switchEl = container.querySelector('toggle-switch') as ToggleSwitch;

  expect(switchEl).not.toBeNull();
  expect(switchEl.on).toBe(false);
});
