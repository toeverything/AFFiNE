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
  await addCustomProperty(page, 'Text');
  await addCustomProperty(page, 'Number');
  await addCustomProperty(page, 'Date');
  await addCustomProperty(page, 'Checkbox');
  await addCustomProperty(page, 'Created by');
  await addCustomProperty(page, 'Last edited by');
});

test('add custom property & edit', async ({ page }) => {
  await addCustomProperty(page, 'Checkbox');
  await expect(
    getPropertyValueLocator(page, 'Checkbox').locator('input')
  ).not.toBeChecked();
  await clickPropertyValue(page, 'Checkbox');
  await expect(
    getPropertyValueLocator(page, 'Checkbox').locator('input')
  ).toBeChecked();
});

test('property table reordering', async ({ page }) => {
  await addCustomProperty(page, 'Text');
  await addCustomProperty(page, 'Number');
  await addCustomProperty(page, 'Date');
  await addCustomProperty(page, 'Checkbox');
  await addCustomProperty(page, 'Created by');
  await addCustomProperty(page, 'Last edited by');

  await dragTo(
    page,
    page.locator('[data-testid="page-property-row-name"]:has-text("Text")'),
    page.locator(
      '[data-testid="page-property-row-name"]:has-text("Checkbox") + div'
    )
  );

  // new order should be (Tags), Number, Date, Checkbox, Text
  for (const [index, property] of [
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
        .getByTestId('page-property-row')
        .nth(index)
        .getByTestId('page-property-row-name')
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
  await addCustomProperty(page, 'Text');
  await addCustomProperty(page, 'Number');
  await addCustomProperty(page, 'Date');
  await addCustomProperty(page, 'Checkbox');
  await addCustomProperty(page, 'Created by');
  await addCustomProperty(page, 'Last edited by');

  await expect(page.getByTestId('page-info-show-more')).toBeVisible();
  await page.click('[data-testid="page-info-show-more"]');
  await expect(
    page.getByRole('heading', {
      name: 'customize properties',
    })
  ).toBeVisible();

  // new order should be (Tags), Number, Date, Checkbox, Text
  for (const [index, property] of [
    'Text',
    'Number',
    'Date',
    'Checkbox',
    'Created by',
    'Last edited by',
  ].entries()) {
    await expect(
      page
        .getByTestId('page-properties-settings-menu-item')
        .nth(index)
        .getByTestId('page-property-setting-row-name')
    ).toHaveText(property);
  }
});

test('change page properties visibility', async ({ page }) => {
  await addCustomProperty(page, 'Text');
  await addCustomProperty(page, 'Number');
  await addCustomProperty(page, 'Date');
  await addCustomProperty(page, 'Checkbox');

  // add some number to number property
  await clickPropertyValue(page, 'Number');
  await page.locator('input[type=number]').fill('123');

  await changePropertyVisibility(page, 'Text', 'Hide in view');
  await changePropertyVisibility(page, 'Number', 'Hide in view when empty');

  // text property should not be visible
  await expect(
    page.locator('[data-testid="page-property-row-name"]:has-text("Text")')
  ).not.toBeVisible();

  // number property should be visible
  await expect(
    page.locator('[data-testid="page-property-row-name"]:has-text("Number")')
  ).toBeVisible();
});

test('check if added property is also in workspace settings', async ({
  page,
}) => {
  await addCustomProperty(page, 'Text');
  await openWorkspaceProperties(page);
  await expect(
    page.locator('[data-testid=custom-property-row]:has-text("Text")')
  ).toBeVisible();
});

test('edit property name', async ({ page }) => {
  await addCustomProperty(page, 'Text');
  await page
    .locator('[data-testid="page-property-row-name"]:has-text("Text")')
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
    page.locator('[data-testid=custom-property-row]:has-text("New Text")')
  ).toBeVisible();
});

test('delete property via property popup', async ({ page }) => {
  await addCustomProperty(page, 'Text');
  await page
    .locator('[data-testid="page-property-row-name"]:has-text("Text")')
    .click();
  await expect(page.locator('[data-radix-menu-content]')).toBeVisible();
  await page
    .locator('[data-radix-menu-content]')
    .getByRole('menuitem', {
      name: 'Remove property',
    })
    .click();
  // confirm delete dialog should show
  await expect(page.getByRole('dialog')).toContainText(
    `The "Text" property will be remove from 1 doc(s). This action cannot be undone.`
  );
  await page
    .getByRole('button', {
      name: 'Confirm',
    })
    .click();
  // check if the property is removed
  await expect(
    page.locator('[data-testid="page-property-row-name"]:has-text("Text")')
  ).not.toBeVisible();
});

test('create a required property', async ({ page }) => {
  await openWorkspaceProperties(page);
  await addCustomProperty(page, 'Text', true);

  await page
    .locator('[data-testid="custom-property-row"]:has-text("Text")')
    .getByRole('button')
    .click();

  await page
    .getByRole('menuitem', {
      name: 'Set as required property',
    })
    .click();

  await expect(
    page.locator('[data-testid="custom-property-row"]:has-text("Text")')
  ).toContainText('Required');

  // close workspace settings
  await page.keyboard.press('Escape');

  // check if the property is also required in page properties
  await expect(
    page.locator('[data-testid="page-property-row-name"]:has-text("Text")')
  ).toBeVisible();

  // check if the required property is also listed in the show more menu
  await page.click('[data-testid="page-info-show-more"]');
  await expect(
    page.locator(
      '[data-testid="page-properties-settings-menu-item"]:has-text("Text")'
    )
  ).toContainText('Required');
});

test('delete a required property', async ({ page }) => {
  await openWorkspaceProperties(page);
  await addCustomProperty(page, 'Text', true);

  await page
    .locator('[data-testid="custom-property-row"]:has-text("Text")')
    .getByRole('button')
    .click();

  await page
    .getByRole('menuitem', {
      name: 'Set as required property',
    })
    .click();

  await page
    .locator('[data-testid="custom-property-row"]:has-text("Text")')
    .getByRole('button')
    .click();

  await page
    .getByRole('menuitem', {
      name: 'Delete property',
    })
    .click();
  await page
    .getByRole('button', {
      name: 'Confirm',
    })
    .click();

  // close workspace settings
  await page.keyboard.press('Escape');

  await waitForEditorLoad(page);

  // check if the property is removed from page properties
  await expect(
    page.locator('[data-testid="page-property-row-name"]:has-text("Text")')
  ).not.toBeVisible();
});
