import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

test.describe('Change page mode(Paper or Edgeless)', () => {
  test('Switch to edgeless', async ({ page }) => {
    const switcher = page.locator('[data-testid=editor-mode-switcher]');
    const box = await switcher.boundingBox();
    await expect(box?.x).not.toBeUndefined();

    // mouse hover trigger animation for showing full switcher
    await page.mouse.move((box?.x ?? 0) + 5, (box?.y ?? 0) + 5);

    const edgelessButton = page.locator(
      '[data-testid=editor-mode-switcher] [title=Edgeless]'
    );
    await edgelessButton.click();

    // // mouse move to edgeless button
    // await page.mouse.move(
    //   (box?.x ?? 0) + (box?.width ?? 0) - 5,
    //   (box?.y ?? 0) + 5
    // );

    // await page.waitForTimeout(1000);

    // // click switcher
    // await page.mouse.click(
    //   (box?.x ?? 0) + (box?.width ?? 0) - 5,
    //   (box?.y ?? 0) + 5
    // );

    const edgelessDom = page.locator('edgeless-page-block');

    await expect(await edgelessDom.isVisible()).toBe(true);
  });
});
