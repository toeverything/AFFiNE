import type { IPoint } from '@blocksuite/global/gfx';
import type { Store } from '@blocksuite/store';
import type { Page } from '@playwright/test';

import { toViewCoord } from './edgeless.js';
import { waitNextFrame } from './misc.js';

export function getDebugMenu(page: Page) {
  const debugMenu = page.locator('starter-debug-menu');
  return {
    debugMenu,
    undoBtn: debugMenu.locator('sl-tooltip[content="Undo"]'),
    redoBtn: debugMenu.locator('sl-tooltip[content="Redo"]'),

    blockTypeButton: debugMenu.getByRole('button', { name: 'Block Type' }),
    testOperationsButton: debugMenu.getByRole('button', {
      name: 'Test Operations',
    }),

    pagesBtn: debugMenu.getByTestId('docs-button'),
  };
}

export async function moveView(page: Page, point: [number, number]) {
  const [x, y] = await toViewCoord(page, point);
  await page.mouse.move(x, y);
}

export async function click(page: Page, point: IPoint) {
  await page.mouse.click(point.x, point.y);
}

export async function clickView(page: Page, point: [number, number]) {
  const [x, y] = await toViewCoord(page, point);
  await page.mouse.click(x, y);
}

export async function dblclickView(page: Page, point: [number, number]) {
  const [x, y] = await toViewCoord(page, point);
  await page.mouse.dblclick(x, y);
}

export async function undoByClick(page: Page) {
  await getDebugMenu(page).undoBtn.click();
}

export async function redoByClick(page: Page) {
  await getDebugMenu(page).redoBtn.click();
}

export async function clickBlockById(page: Page, id: string) {
  await page.click(`[data-block-id="${id}"]`);
}

export async function doubleClickBlockById(page: Page, id: string) {
  await page.dblclick(`[data-block-id="${id}"]`);
}

export async function disconnectByClick(page: Page) {
  await clickTestOperationsMenuItem(page, 'Disconnect');
}

export async function connectByClick(page: Page) {
  await clickTestOperationsMenuItem(page, 'Connect');
}

export async function addNoteByClick(page: Page) {
  await clickTestOperationsMenuItem(page, 'Add Note');
}

export async function addNewPage(page: Page) {
  const { pagesBtn } = getDebugMenu(page);
  if (!(await page.locator('docs-panel').isVisible())) {
    await pagesBtn.click();
  }
  await page.locator('.new-doc-button').click();
  const docMetas = await page.evaluate(() => {
    const { collection } = window;
    return collection.meta.docMetas;
  });
  if (!docMetas.length) throw new Error('Add new doc failed');
  return docMetas[docMetas.length - 1];
}

export async function switchToPage(page: Page, docId?: string) {
  await page.evaluate(docId => {
    const { collection, editor } = window;

    if (!docId) {
      const docMetas = collection.meta.docMetas;
      if (!docMetas.length) return;
      docId = docMetas[0].id;
    }

    const doc = collection.getDoc(docId)?.getStore();
    if (!doc) return;
    editor.doc = doc;
  }, docId);
}

export async function clickTestOperationsMenuItem(page: Page, name: string) {
  const menuButton = getDebugMenu(page).testOperationsButton;
  await menuButton.click();
  await waitNextFrame(page); // wait for animation ended

  const menuItem = page.getByRole('menuitem', { name });
  await menuItem.click();
  await menuItem.waitFor({ state: 'hidden' }); // wait for animation ended
}

export async function switchReadonly(page: Page, value = true) {
  await page.evaluate(_value => {
    const defaultPage = document.querySelector(
      'affine-page-root,affine-edgeless-root'
    ) as HTMLElement & {
      store: Store;
    };
    const store = defaultPage.store;
    store.readonly = _value;
  }, value);
}

export async function activeEmbed(page: Page) {
  await page.click('.resizable-img');
}

export async function toggleDarkMode(page: Page) {
  await page.click('sl-tooltip[content="Toggle Dark Mode"] sl-button');
}
