import { test } from '@affine-test/kit/mobile';
import { expect, type Locator, type Page } from '@playwright/test';

import {
  expandCollapsibleSection,
  getAttrOfActiveElement,
  openNavigationPanelNodeMenu,
} from './utils';

async function locateTag(scope: Page | Locator, name: string) {
  return scope.locator(
    `[data-role="navigation-panel-tag"][aria-label="${name}"]`
  );
}

async function getNavigationPanelTagColor(tagNode: Locator) {
  const icon = tagNode.getByTestId('navigation-panel-tag-icon-dot');
  await expect(icon).toBeVisible();
  const color = await icon.evaluate(el => el.style.backgroundColor);
  return color;
}

async function changeTagColor(scope: Locator, color: string) {
  const trigger = scope.getByTestId('tag-color-picker-trigger');
  const select = scope.getByTestId('tag-color-picker-select');
  await trigger.tap();
  await expect(select).toBeVisible();
  const colorDot = select.locator(`[data-color="${color}"]`);
  await colorDot.tap();
}

async function createRootTag(
  page: Page,
  name: string,
  color = 'var(--affine-palette-line-red)'
) {
  const section = await expandCollapsibleSection(page, 'tags');
  await section.getByTestId('navigation-panel-add-tag-button').tap();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // input name
  const focusedTestid = await getAttrOfActiveElement(page);
  expect(focusedTestid).toEqual('rename-input');
  await page.keyboard.type(name);
  // set color
  await changeTagColor(dialog, color);
  // confirm
  await dialog.getByTestId('rename-input').focus();
  await dialog.getByTestId('rename-confirm').tap();
  const tag = await locateTag(section, name);
  await expect(tag).toBeVisible();
  // check tag color
  const fill = await getNavigationPanelTagColor(tag);
  expect(fill).toEqual(color);
  return tag;
}

test('create a tag from navigation panel', async ({ page }) => {
  const tag = await createRootTag(page, 'Test Tag');
  await tag.getByTestId('navigation-panel-collapsed-button').tap();
  await expect(tag).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('navigation-panel-tag-add-page')).toBeVisible();
});

test('rename a tag from navigation panel', async ({ page }) => {
  const originalName = 'Test Tag';
  const appendedName = ' Renamed';

  const tag = await createRootTag(page, originalName);
  const menu = await openNavigationPanelNodeMenu(page, tag);
  const rename = menu.getByTestId('rename-tag');
  const renameBox = await rename.boundingBox();
  expect(renameBox).not.toBeNull();
  if (!renameBox) throw new Error('Rename action has no layout box');
  const touchPoint = {
    x: renameBox.x + renameBox.width / 2,
    y: renameBox.y + renameBox.height / 2,
  };
  await page.touchscreen.tap(touchPoint.x, touchPoint.y);
  await expect(menu.getByTestId('rename-input')).toBeVisible();
  const back = menu.getByTestId('mobile-menu-back-button').last();
  const backBox = await back.boundingBox();
  expect(backBox).not.toBeNull();
  if (!backBox) throw new Error('Rename back button has no layout box');
  await page.touchscreen.tap(
    backBox.x + backBox.width / 2,
    backBox.y + backBox.height / 2
  );
  await expect(menu.getByTestId('rename-tag')).toBeVisible();
  await menu.getByTestId('rename-tag').tap();
  const focusedTestid = await getAttrOfActiveElement(page);
  expect(focusedTestid).toEqual('rename-input');
  await page.keyboard.type(appendedName);
  await menu.getByTestId('rename-confirm').tap();
  await expect(tag).not.toBeVisible();
  const renamedTag = await locateTag(page, originalName + appendedName);
  await expect(renamedTag).toBeVisible();
});

test('change tag color from navigation panel', async ({ page }) => {
  const newColor = 'var(--affine-palette-line-green)';
  const tagName = 'Test Tag';
  const tag = await createRootTag(page, tagName);
  const menu = await openNavigationPanelNodeMenu(page, tag);
  await menu.getByTestId('rename-tag').tap();
  await changeTagColor(menu, newColor);
  await menu.getByTestId('rename-confirm').tap();

  const updatedTag = await locateTag(page, tagName);
  const fill = await getNavigationPanelTagColor(updatedTag);
  expect(fill).toEqual(newColor);
});
