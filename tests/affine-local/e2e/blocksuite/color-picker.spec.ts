import { test } from '@affine-test/kit/playwright';
import { importFile } from '@affine-test/kit/utils/attachment';
import {
  clickEdgelessModeButton,
  dragView,
  locateToolbar,
} from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEditorLoad(page);
});

test('should keep color on custom color button', async ({ page }) => {
  await page.getByTestId('header-dropDownButton').click();
  await page.getByTestId('editor-option-menu-import').click();

  const importDialog = page.getByTestId('import-dialog');
  await expect(importDialog).toBeVisible();

  const importSnapshot = importDialog.getByTestId(
    'editor-option-menu-import-snapshot'
  );

  const completeButton = importDialog.getByRole('button', { name: 'Complete' });

  await importFile(page, 'v1-color-palettes-snapshot.zip', async () => {
    await importSnapshot.click();
  });

  await completeButton.click();

  await waitForEditorLoad(page);

  const title = getBlockSuiteEditorTitle(page);
  await expect(title).toContainText('Getting Started');

  await clickEdgelessModeButton(page);

  const toolbar = locateToolbar(page);

  const colorPicker = toolbar.locator('edgeless-color-picker-button');

  // frame
  {
    const frameTitle = page.locator('affine-frame-title');

    await frameTitle.click();

    await expect(toolbar).toBeVisible();

    const backgroundButton = toolbar.getByLabel('Background');
    const colorButton = backgroundButton
      .locator('edgeless-color-button')
      .first();
    const color = await colorButton.locator('svg').getAttribute('fill');

    expect(color).not.toBeNull();

    await backgroundButton.click();

    const customColorButton = colorPicker.locator(
      'edgeless-color-custom-button'
    );
    const keptColor = await customColorButton.evaluate(e =>
      e.style.getPropertyValue('--c')
    );

    expect(keptColor.startsWith('#')).toBe(true);
    expect(keptColor.length).toBe(7);
    expect(color).toBe(keptColor);
  }

  // shape
  {
    await dragView(page, [5425 - 10, 2658 - 10], [5425 + 20, 2658 + 20]);

    await expect(toolbar).toBeVisible();

    const colorButton = toolbar.getByLabel(/^Color$/);

    await colorButton.click();

    const fillCustomColorButton = colorPicker
      .locator('edgeless-color-custom-button')
      .first();
    const strokeCustomColorButton = colorPicker
      .locator('edgeless-color-custom-button')
      .last();

    const fillKeptColor = await fillCustomColorButton.evaluate(e =>
      e.style.getPropertyValue('--c')
    );
    const strokeKeptColor = await strokeCustomColorButton.evaluate(e =>
      e.style.getPropertyValue('--c')
    );

    expect(fillKeptColor.length).toBe(7);
    expect(fillKeptColor.startsWith('#')).toBe(true);
    expect(strokeKeptColor.length).toBe(7);
    expect(strokeKeptColor.startsWith('#')).toBe(true);
  }
});
