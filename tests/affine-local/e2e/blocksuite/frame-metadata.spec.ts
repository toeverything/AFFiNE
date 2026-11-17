import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  clickPageModeButton,
  dragView,
  locateEditorContainer,
  locateToolbar,
} from '@affine-test/kit/utils/editor';
import {
  pressBackspace,
  selectAllByKeyboard,
} from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Page } from '@playwright/test';

const FRAME_METADATA_ACTIONS = [
  'Export Frame Metadata',
  'Export Frame PNG',
  'Import Frame Metadata',
  'Import Frame PNG',
];

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await clickEdgelessModeButton(page);
  const container = locateEditorContainer(page);
  await container.click();
  await selectAllByKeyboard(page);
  await pressBackspace(page);

  await page.keyboard.press('f');
  await dragView(page, [0, 100], [300, 400]);
  await expect(locateToolbar(page)).toBeVisible();
});

async function openMoreMenu(page: Page) {
  const toolbar = locateToolbar(page);
  const container = toolbar.getByLabel('More menu');
  await container.getByLabel('More').click();
  const menu = container.getByRole('menu');
  await expect(menu).toBeVisible();
  return { container, menu };
}

async function menuItemLabels(page: Page) {
  // menu items are slotted into editor-menu-button, so they are DOM
  // descendants of the container rather than of the shadow role=menu
  const { container } = await openMoreMenu(page);
  await expect(container.getByLabel('Delete')).toBeVisible();
  return container
    .locator('editor-menu-action[aria-label]')
    .evaluateAll(items => items.map(item => item.getAttribute('aria-label')));
}

function expectMetadataActionsAboveDelete(labels: (string | null)[]) {
  const deleteIndex = labels.indexOf('Delete');
  expect(deleteIndex).toBeGreaterThan(-1);
  for (const label of FRAME_METADATA_ACTIONS) {
    const index = labels.indexOf(label);
    expect(index, `${label} in ${labels.join(', ')}`).toBeGreaterThan(-1);
    expect(index, `${label} above Delete`).toBeLessThan(deleteIndex);
  }
}

async function insertFrameIntoPage(page: Page) {
  await locateToolbar(page).getByLabel('Insert into Page').click();
  await clickPageModeButton(page);
  await waitForEditorLoad(page);

  const surfaceRef = page.locator('affine-surface-ref');
  await expect(surfaceRef).toBeVisible();
  await surfaceRef.click();
  await expect(locateToolbar(page)).toBeVisible();
}

test('edgeless frame more menu lists metadata actions between Properties and Delete', async ({
  page,
}) => {
  const labels = await menuItemLabels(page);
  const propertiesIndex = labels.indexOf('Properties');
  const deleteIndex = labels.indexOf('Delete');
  expect(propertiesIndex).toBeGreaterThan(-1);
  expect(labels.slice(propertiesIndex + 1, deleteIndex)).toEqual(
    FRAME_METADATA_ACTIONS
  );
});

test('page-mode frame reference more menu lists metadata actions above Delete', async ({
  page,
}) => {
  await insertFrameIntoPage(page);
  expectMetadataActionsAboveDelete(await menuItemLabels(page));
});

test('page-mode frame reference exports and re-imports frame metadata', async ({
  page,
}) => {
  await insertFrameIntoPage(page);

  const { container } = await openMoreMenu(page);
  const downloadPromise = page.waitForEvent('download');
  await container.getByLabel('Export Frame Metadata').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  await expect(
    page.locator('.toast-container').getByText('Frame metadata exported.')
  ).toBeVisible();

  await page.evaluate(() => {
    // force the <input type=file> fallback so Playwright can supply the file
    (window as { showOpenFilePicker?: unknown }).showOpenFilePicker = undefined;
  });

  const fileChooserPromise = page.waitForEvent('filechooser');
  const reopened = await openMoreMenu(page);
  await reopened.container.getByLabel('Import Frame Metadata').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(downloadPath!);

  await expect(
    page.locator('.toast-container').getByText('Frame metadata imported.')
  ).toBeVisible();
});
