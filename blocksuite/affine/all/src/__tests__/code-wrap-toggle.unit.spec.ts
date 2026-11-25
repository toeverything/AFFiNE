/**
 * @vitest-environment happy-dom
 */
import { ToggleSwitch } from '@blocksuite/affine-components/toggle-switch';
import { EditorMenuAction } from '@blocksuite/affine-components/toolbar';
import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { toggleGroup } from '../../../blocks/code/src/code-toolbar/config.js';

function renderWrapItem(setWrap: (wrap: boolean) => unknown, wrap = false) {
  const blockComponent = {
    model: { props: { wrap } },
    setWrap,
  };
  const item = toggleGroup.items.find(item => item.type === 'wrap');
  if (!item || !('generate' in item) || !item.generate) {
    throw new Error('wrap toolbar item is missing a generate function');
  }
  // only the block component is read by the wrap item
  const generated = item.generate({ blockComponent } as never) as unknown as {
    render: () => unknown;
  };
  const container = document.createElement('div');
  render(generated.render() as never, container);
  return container;
}

describe('code block wrap toggle', () => {
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
    const setWrap = vi.fn();
    const container = renderWrapItem(setWrap);

    const row = container.querySelector('editor-menu-action');
    const toggle = container.querySelector('toggle-switch');
    expect(row).not.toBeNull();
    expect(toggle).not.toBeNull();

    // the switch reports its own state through onChange, so the click must not
    // bubble up to the row that toggles wrap a second time
    toggle!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true })
    );

    expect(setWrap).not.toHaveBeenCalled();
  });

  test('clicking the row still toggles wrap', () => {
    const setWrap = vi.fn();
    const container = renderWrapItem(setWrap);

    const row = container.querySelector('editor-menu-action');
    expect(row).not.toBeNull();

    row!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true })
    );

    expect(setWrap).toHaveBeenCalledTimes(1);
    expect(setWrap).toHaveBeenCalledWith(true);
  });

  test('the switch reports the current wrap state', () => {
    const setWrap = vi.fn();
    const container = renderWrapItem(setWrap, true);

    const toggle = container.querySelector('toggle-switch') as ToggleSwitch;
    expect(toggle).not.toBeNull();
    expect(toggle.on).toBe(true);
  });
});
