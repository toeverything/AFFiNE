/* eslint-disable unicorn/prefer-dom-node-dataset */
import { test } from '@affine-test/kit/playwright';
import {
  openHomePage,
  openJournalsPage,
} from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  dragTo,
  waitForEditorLoad,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import {
  addCustomProperty,
  changePropertyVisibility,
  clickPropertyValue,
  closeTagsEditor,
  ensurePagePropertiesVisible,
  expectTagsVisible,
  getPropertyValueLocator,
  openTagsEditor,
  openWorkspaceProperties,
  removeSelectedTag,
  searchAndCreateTag,
  togglePropertyListVisibility,
} from '@affine-test/kit/utils/properties';
import { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);
  await ensurePagePropertiesVisible(page);
});

test('allow create tag', async ({ page }) => {
  await openTagsEditor(page);
  await searchAndCreateTag(page, 'Test1');
  await searchAndCreateTag(page, 'Test2');
  await closeTagsEditor(page);
  await expectTagsVisible(page, ['Test1', 'Test2']);

  await openTagsEditor(page);
  await removeSelectedTag(page, 'Test1');
  await closeTagsEditor(page);
  await expectTagsVisible(page, ['Test2']);
});

test('allow using keyboard to navigate tags', async ({ page }) => {
  await openTagsEditor(page);
  await searchAndCreateTag(page, 'Test1');
  await searchAndCreateTag(page, 'Test2');

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Backspace');
  await closeTagsEditor(page);
  await expectTagsVisible(page, ['Test1']);

  await openTagsEditor(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await closeTagsEditor(page);
  await expectTagsVisible(page, ['Test1', 'Test2']);
});

test('allow create tag on journals page', async ({ page }) => {
  await openJournalsPage(page);
  await waitForEditorLoad(page);
  await ensurePagePropertiesVisible(page);

  await openTagsEditor(page);
  await searchAndCreateTag(page, 'Test1');
  await searchAndCreateTag(page, 'Test2');
  await closeTagsEditor(page);
  await expectTagsVisible(page, ['Test1', 'Test2']);

  await openTagsEditor(page);
  await removeSelectedTag(page, 'Test1');
  await closeTagsEditor(page);
  await expectTagsVisible(page, ['Test2']);
});

test('add custom property', async ({ page }) => {
  await addCustomProperty(page, page, 'text');
  await addCustomProperty(page, page, 'number');
  await addCustomProperty(page, page, 'date');
  await addCustomProperty(page, page, 'checkbox');
  await addCustomProperty(page, page, 'createdBy');
  await addCustomProperty(page, page, 'updatedBy');
});

test('add custom property & edit', async ({ page }) => {
  await addCustomProperty(page, page, 'checkbox');
  await expect(
    getPropertyValueLocator(page, 'checkbox').locator('input')
  ).not.toBeChecked();
  await clickPropertyValue(page, 'checkbox');
  await expect(
    getPropertyValueLocator(page, 'checkbox').locator('input')
  ).toBeChecked();
});

test('property table reordering', async ({ page }) => {
  await addCustomProperty(page, page, 'text');
  await addCustomProperty(page, page, 'number');
  await addCustomProperty(page, page, 'date');
  await addCustomProperty(page, page, 'checkbox');
  await addCustomProperty(page, page, 'createdBy');
  await addCustomProperty(page, page, 'updatedBy');

  await dragTo(
    page,
    page.locator('[data-testid="doc-property-name"]:has-text("Text")'),
    page.locator(
      '[data-testid="doc-property-name"]:has-text("Checkbox") + div'
    ),
    'bottom'
  );

  // new order should be Doc mode, (Tags), Number, Date, Checkbox, Text
  for (const [index, property] of [
    'Doc mode',
    'Tags',
    'Number',
    'Date',
    'Checkbox',
    'Text',
    'Created by',
    'Last edited by',
  ].entries()) {
    await expect(
      page
        .getByTestId('doc-property-row')
        .nth(index)
        .getByTestId('doc-property-name')
    ).toHaveText(property);
  }
});

test('page info show more will not should by default when there is no properties', async ({
  page,
}) => {
  // by default page info show more should not show
  await expect(page.getByTestId('page-info-show-more')).not.toBeVisible();
});

test('page info show more will show all properties', async ({ page }) => {
  await addCustomProperty(page, page, 'text');
  await addCustomProperty(page, page, 'number');
  await addCustomProperty(page, page, 'date');
  await addCustomProperty(page, page, 'checkbox');
  await addCustomProperty(page, page, 'createdBy');
  await addCustomProperty(page, page, 'updatedBy');

  await changePropertyVisibility(page, 'Text', 'always-hide');

  await expect(page.getByTestId('property-collapsible-button')).toBeVisible();
  await page.click('[data-testid="property-collapsible-button"]');

  for (const [index, property] of [
    'Doc mode',
    'Tags',
    'Text',
    'Number',
    'Date',
    'Checkbox',
    'Created by',
    'Last edited by',
  ].entries()) {
    await expect(
      page
        .getByTestId('doc-property-row')
        .nth(index)
        .getByTestId('doc-property-name')
    ).toHaveText(property);
  }
});

test('change page properties visibility', async ({ page }) => {
  await addCustomProperty(page, page, 'text');
  await addCustomProperty(page, page, 'number');
  await addCustomProperty(page, page, 'date');
  await addCustomProperty(page, page, 'checkbox');
  await togglePropertyListVisibility(page);

  // add some number to number property
  await clickPropertyValue(page, 'Number');
  await page.locator('input[type=number]').fill('123');

  await changePropertyVisibility(page, 'Text', 'always-hide');
  await changePropertyVisibility(page, 'Number', 'hide-when-empty');

  // text property should not be visible
  await expect(
    page.locator('[data-testid="doc-property-name"]:has-text("Text")')
  ).not.toBeVisible();

  // number property should be visible
  await expect(
    page.locator('[data-testid="doc-property-name"]:has-text("Number")')
  ).toBeVisible();
});

test('check if added property is also in workspace settings', async ({
  page,
}) => {
  await addCustomProperty(page, page, 'text');
  await openWorkspaceProperties(page);
  await expect(
    page.locator('[data-testid=doc-property-manager-item]:has-text("Text")')
  ).toBeVisible();
});

test('edit property name', async ({ page }) => {
  await addCustomProperty(page, page, 'text');
  await page
    .locator('[data-testid="doc-property-name"]:has-text("Text")')
    .click();
  await expect(page.locator('[data-radix-menu-content]')).toBeVisible();
  await expect(page.locator('[data-radix-menu-content] input')).toHaveValue(
    'Text'
  );
  await page.locator('[data-radix-menu-content] input').fill('New Text');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-radix-menu-content] input')).toHaveValue(
    'New Text'
  );
  await page.keyboard.press('Escape');

  // check if the property name is also updated in workspace settings
  await openWorkspaceProperties(page);
  await expect(
    page.locator('[data-testid=doc-property-manager-item]:has-text("New Text")')
  ).toBeVisible();
});

test('delete property via property popup', async ({ page }) => {
  await addCustomProperty(page, page, 'text');
  await page
    .locator('[data-testid="doc-property-name"]:has-text("Text")')
    .click();
  await expect(page.locator('[data-radix-menu-content]')).toBeVisible();
  await page
    .locator('[data-radix-menu-content]')
    .getByRole('menuitem', {
      name: 'Delete property',
    })
    .click();
  // confirm delete dialog should show
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Confirm',
    })
    .click();
  // check if the property is removed
  await expect(
    page.locator('[data-testid="http://localhost:8080/"]:has-text("Text")')
  ).not.toBeVisible();
});
