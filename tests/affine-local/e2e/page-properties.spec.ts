import { waitNextFrame } from '@affine-test/kit/bs/misc';
import { test } from '@affine-test/kit/playwright';
import {
  openHomePage,
  openJournalsPage,
} from '@affine-test/kit/utils/load-page';
import {
  addDatabase,
  addDatabaseRow,
  clickNewPageButton,
  createLinkedPage,
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

import { addColumn } from './blocksuite/database/utils';

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

  // new order should be Doc mode, (Tags), Created at, Updated at, Number, Date, Checkbox, Text
  for (const [index, property] of [
    'Tags',
    'Doc mode',
    'Journal',
    'Template',
    'Created',
    'Updated',
    'Created by',
    'Edgeless theme',
    'Page width',
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
    'Tags',
    'Doc mode',
    'Journal',
    'Template',
    'Created',
    'Updated',
    'Created by',
    'Edgeless theme',
    'Page width',
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
  const settingModal = page.locator('[data-testid=setting-modal-content]');
  const item = settingModal.locator(
    '[data-testid=doc-property-manager-item]:has-text("Text")'
  );
  await item.waitFor({ state: 'attached' });
  await expect(item).toBeVisible();
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
  const settingModal = page.locator('[data-testid=setting-modal-content]');
  const item = settingModal.locator(
    '[data-testid=doc-property-manager-item]:has-text("New Text")'
  );
  await item.waitFor({ state: 'attached' });
  await expect(item).toBeVisible();
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

test('workspace properties can be collapsed', async ({ page }) => {
  await expect(page.getByTestId('doc-property-row').first()).toBeVisible();
  await page.getByRole('button', { name: 'Workspace properties' }).click();
  await expect(page.getByTestId('doc-property-row').first()).not.toBeVisible();
  await page.getByRole('button', { name: 'Workspace properties' }).click();
  await expect(page.getByTestId('doc-property-row').first()).toBeVisible();
});

// todo: add more tests for database backlink info for different cell types
test('can show database backlink info', async ({ page }) => {
  const pageTitle = 'some page title';
  await clickNewPageButton(page, pageTitle);
  await page.keyboard.press('Enter');

  const databaseTitle = 'some database title';
  await addDatabase(page, databaseTitle);
  await addColumn(page, 'select', 2);

  await expect(page.locator('affine-database-title')).toContainText(
    databaseTitle
  );

  await expect(
    page.locator(`affine-database-title:has-text("${databaseTitle}")`)
  ).toBeVisible();

  await addDatabaseRow(page, 0);

  // the new row's title cell should have been focused at the point of adding the row
  await createLinkedPage(page, 'linked page');

  // change status label
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await waitNextFrame(page);
  await waitNextFrame(page);
  await page.keyboard.type('Done');
  await waitNextFrame(page);
  await page.keyboard.press('Enter');

  // go back to title cell
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');

  // goto the linked page
  await page.locator('.affine-reference-title:has-text("linked page")').click();

  // ensure the page properties are visible
  await ensurePagePropertiesVisible(page);

  // database backlink property should be rendered, but collapsed
  const linkedDatabaseSection = page
    .getByTestId('property-collapsible-section')
    .filter({
      hasText: 'some database title',
    });
  await expect(linkedDatabaseSection).toBeVisible();

  await expect(
    linkedDatabaseSection.getByTestId('property-collapsible-section-content')
  ).not.toBeVisible();

  await expect(
    linkedDatabaseSection.locator(
      `.affine-reference-title:has-text("${pageTitle}")`
    )
  ).toBeVisible();

  // expand the linked database section
  await linkedDatabaseSection
    .getByTestId('property-collapsible-section-trigger')
    .click();

  await expect(
    linkedDatabaseSection.getByTestId('property-collapsible-section-content')
  ).toBeVisible();

  await expect(
    linkedDatabaseSection
      .getByTestId('database-backlink-cell')
      .getByTestId('inline-tags-list')
      .filter({
        hasText: 'Done',
      })
  ).toBeVisible();
});
