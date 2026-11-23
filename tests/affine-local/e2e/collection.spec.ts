import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { getCurrentCollectionIdFromUrl } from '@affine-test/kit/utils/url';
import { expect, type Page } from '@playwright/test';

async function addDocToCollection(page: Page) {
  await page.getByText('Add docs', { exact: true }).click();
  await page.getByTestId('doc-list-item-select').first().click();
  await page.getByTestId('save-collection').click();
}

async function createCollection(page: Page, name: string) {
  await page.getByTestId('navigation-panel-bar-add-collection-button').click();
  const input = await page.getByTestId('prompt-modal-input');
  await expect(input).toBeVisible();
  await input.fill(name);
  await page.getByTestId('prompt-modal-confirm').click();
  const newCollectionId = await getCurrentCollectionIdFromUrl(page);
  const collection = await page.getByTestId(
    `navigation-panel-collection-${newCollectionId}`
  );
  await expect(collection).toBeVisible();
  await addDocToCollection(page);
  return collection;
}

async function changeViewMode(page: Page, mode: 'list' | 'grid' | 'masonry') {
  await page.locator(`button[value="${mode}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
});

test('Collection view mode is saved', async ({ page }) => {
  // Create a collection and open it
  const collectionSidebarButton = await createCollection(
    page,
    'test-collection'
  );
  // Check that view mode is list
  await expect(page.locator('button[value="list"]')).toBeChecked();
  // Change view mode
  await changeViewMode(page, 'grid');
  // Check that view mode button works
  await expect(page.locator('button[value="grid"]')).toBeChecked();
  // Navigate away from collection
  await openHomePage(page);
  // Open the collection again
  await collectionSidebarButton.click();
  // Check if the view mode is still grid
  await expect(page.locator('button[value="grid"]')).toBeChecked();
});

test('Collection display preferences are saved', async ({ page }) => {
  // Create a collection and open it
  const collectionSidebarButton = await createCollection(
    page,
    'test-collection'
  );
  // Change a display property
  await page.getByTestId('explorer-display-menu-button').click();
  await page.locator('button[data-key="system:pageWidth"]').click();
  // Navigate away from the collection
  await openHomePage(page);
  // Open the collection again
  await collectionSidebarButton.click();
  // Check if the changed property persists
  await page.getByTestId('explorer-display-menu-button').click();
  await expect(
    page.locator('button[data-key="system:pageWidth"]')
  ).toHaveAttribute('data-show', 'true');
});

test('Collection display preferences are saved per collection', async ({
  page,
}) => {
  // Set up collection 1
  const collection1 = await createCollection(page, 'test-collection1');
  await changeViewMode(page, 'grid');

  // Set up collection 2
  const collection2 = await createCollection(page, 'test-collection2');
  await changeViewMode(page, 'masonry');

  // Go back to collection 1 and verify view mode is grid
  await collection1.click();
  await expect(page.locator('button[value="grid"]')).toBeChecked();

  // Go back to collection 2 and verify view mode is masonry
  await collection2.click();
  await expect(page.locator('button[value="masonry"]')).toBeChecked();
});
