import { EditPropsStore } from '@blocksuite/affine/shared/services';
import type { BlockStdScope } from '@blocksuite/std';
import { beforeEach, describe, expect, test } from 'vitest';

import { EdgelessGridMenu } from '../../../../affine/widgets/edgeless-zoom-toolbar/src/grid-menu.js';
import { getDocRootBlock } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('edgeless grid menu', () => {
  let store!: EditPropsStore;
  let std!: BlockStdScope;

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');
    const edgelessRoot = getDocRootBlock(doc, editor, 'edgeless');
    store = edgelessRoot.std.get(EditPropsStore);
    std = edgelessRoot.std;
    return cleanup;
  });

  async function mountMenu() {
    const menu = new EdgelessGridMenu();
    menu.std = std;
    document.body.append(menu);
    await menu.updateComplete;
    return menu;
  }

  test('loads stored settings into the menu', async () => {
    store.setStorage('edgelessShowGrid', false);
    store.setStorage('edgelessGridSize', 50);
    store.setStorage('edgelessSnapToGrid', true);
    store.setStorage('edgelessSnapToGuides', false);
    store.setStorage('edgelessConnectorSnapToGrid', true);

    const menu = await mountMenu();
    const trigger = menu.renderRoot.querySelector(
      'button.grid-menu-trigger'
    ) as HTMLButtonElement;
    trigger.click();
    await menu.updateComplete;

    const inputs = Array.from(
      menu.renderRoot.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]'
      )
    );
    expect(inputs).toHaveLength(4);
    const [showGrid, snapToGrid, snapConnector, snapToGuides] = inputs;
    expect(showGrid.checked).toBe(false);
    expect(snapToGrid.checked).toBe(true);
    expect(snapConnector.checked).toBe(true);
    expect(snapToGuides.checked).toBe(false);

    const selectedSize = menu.renderRoot.querySelector(
      '.grid-size-option.selected'
    ) as HTMLButtonElement | null;
    expect(selectedSize?.textContent?.trim()).toBe('50px');

    menu.remove();
  });

  test('toggles grid visibility and emits event', async () => {
    store.setStorage('edgelessShowGrid', true);
    const menu = await mountMenu();
    let detail: { visible: boolean } | undefined;
    menu.addEventListener('grid-visibility-changed', event => {
      detail = (event as CustomEvent).detail;
    });

    (menu as any)._toggleShowGrid();

    expect(store.getStorage('edgelessShowGrid')).toBe(false);
    expect(detail).toEqual({ visible: false });

    menu.remove();
  });

  test('updates grid size from custom input', async () => {
    const menu = await mountMenu();
    const trigger = menu.renderRoot.querySelector(
      'button.grid-menu-trigger'
    ) as HTMLButtonElement;
    trigger.click();
    await menu.updateComplete;

    const input = menu.renderRoot.querySelector(
      '.grid-size-custom'
    ) as HTMLInputElement;
    input.value = '120';
    input.dispatchEvent(new Event('input'));

    expect(store.getStorage('edgelessGridSize')).toBe(120);

    menu.remove();
  });

  test('toggles snap settings and emits events', async () => {
    store.setStorage('edgelessSnapToGrid', false);
    store.setStorage('edgelessSnapToGuides', true);
    const menu = await mountMenu();
    let gridDetail: { enabled: boolean } | undefined;
    let guideDetail: { enabled: boolean } | undefined;
    menu.addEventListener('snap-to-grid-changed', event => {
      gridDetail = (event as CustomEvent).detail;
    });
    menu.addEventListener('snap-to-guides-changed', event => {
      guideDetail = (event as CustomEvent).detail;
    });

    (menu as any)._toggleSnapToGrid();
    (menu as any)._toggleSnapToGuides();

    expect(store.getStorage('edgelessSnapToGrid')).toBe(true);
    expect(store.getStorage('edgelessSnapToGuides')).toBe(false);
    expect(gridDetail).toEqual({ enabled: true });
    expect(guideDetail).toEqual({ enabled: false });

    menu.remove();
  });
});
