import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  dragView,
  locateToolbar,
  setEdgelessTool,
} from '@affine-test/kit/utils/editor';
import { selectAllByKeyboard } from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

function hexToRGB(hex: string) {
  hex = hex.replace(/^#/, '');
  const len = hex.length;
  let arr: string[] = [];

  if (len === 3 || len === 4) {
    arr = hex.split('').map(s => s.repeat(2));
  } else if (len === 6 || len === 8) {
    arr = Array.from<number>({ length: len / 2 })
      .fill(0)
      .map((n, i) => n + i * 2)
      .map(n => hex.substring(n, n + 2));
  }

  const values = arr
    .map(s => parseInt(s, 16))
    .map((n, i) => (i === 3 ? (n % 255) / 255 : n));

  return `rgb${values.length === 4 ? 'a' : ''}(${values.join(', ')})`;
}

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);
});

test('should toggle toolbar when dragging page area', async ({ page }) => {
  await page.keyboard.press('Enter');
  await page.keyboard.type('Roman');
  await selectAllByKeyboard(page);

  const toolbar = locateToolbar(page);

  await expect(toolbar).toBeVisible();
  await expect(toolbar).toBeInViewport();

  const paragraph = page.locator('affine-note affine-paragraph').nth(0);
  const bounds = await paragraph.boundingBox();

  expect(bounds).toBeTruthy();
  const { x, y, width } = bounds!;

  await page.mouse.move(x + width + 10, y - 10, { steps: 2 });
  await page.mouse.down();
  await page.mouse.move(x + width - 10, y + 10, { steps: 2 });

  await expect(toolbar).toBeHidden();

  await page.mouse.up();

  await expect(toolbar).toBeVisible();
});

test.describe('Formatting', () => {
  test('should change text color', async ({ page }) => {
    await page.keyboard.press('Enter');

    await page.keyboard.type('hello world');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');

    const toolbar = locateToolbar(page);
    const highlightButton = toolbar.locator('affine-highlight-duotone-icon');

    await highlightButton.click();

    const fgGreenButton = toolbar.locator('[data-testid="foreground-green"]');
    await fgGreenButton.click();
    const fgColor = await fgGreenButton
      .locator('affine-text-duotone-icon')
      .evaluate(e => window.getComputedStyle(e).getPropertyValue('--color'));

    const paragraph = page.locator('affine-paragraph');
    const textSpan = paragraph
      .locator('affine-text:has-text("rld")')
      .locator('span')
      .first();

    await expect(textSpan).toBeVisible();

    await expect(textSpan).toHaveCSS('color', hexToRGB(fgColor));
  });

  test('should change text background color', async ({ page }) => {
    await page.keyboard.press('Enter');

    await page.keyboard.type('hello world');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');

    const toolbar = locateToolbar(page);
    const highlightButton = toolbar.locator('affine-highlight-duotone-icon');

    await highlightButton.click();

    const fgGreenButton = toolbar.locator('[data-testid="foreground-green"]');
    await fgGreenButton.click();

    await page.waitForTimeout(200);

    const fgColor = await fgGreenButton
      .locator('affine-text-duotone-icon')
      .evaluate(e => window.getComputedStyle(e).getPropertyValue('--color'));

    const paragraph = page.locator('affine-paragraph');
    const textSpan1 = paragraph
      .locator('affine-text:has-text("rld")')
      .locator('span')
      .first();

    await expect(textSpan1).toHaveCSS('color', hexToRGB(fgColor));

    await page.keyboard.press('ArrowRight');

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowLeft');
    }

    await highlightButton.click();

    const yellow = 'var(--affine-text-highlight-yellow)';
    const bgYellowButton = toolbar.locator('[data-testid="background-yellow"]');
    await bgYellowButton.click();

    const textSpan2 = paragraph
      .locator('affine-text:has-text("wo")')
      .locator('span')
      .first();

    await expect(textSpan2).toBeVisible();

    const bgColor1 = await textSpan1.evaluate(e => e.style.backgroundColor);
    const bgColor2 = await textSpan2.evaluate(e => e.style.backgroundColor);

    expect(yellow).toBe(bgColor1);
    expect(yellow).toBe(bgColor2);

    const bgColor = await bgYellowButton
      .locator('affine-text-duotone-icon')
      .evaluate(e =>
        window.getComputedStyle(e).getPropertyValue('--background')
      );

    await expect(textSpan1).toHaveCSS('background-color', hexToRGB(bgColor));
    await expect(textSpan2).toHaveCSS('background-color', hexToRGB(bgColor));
  });
});

test('should not show toolbar when releasing spacebar and elements have been deleted', async ({
  page,
}) => {
  await clickEdgelessModeButton(page);

  await setEdgelessTool(page, 'shape');
  await dragView(page, [100, 300], [200, 400]);

  const toolbar = locateToolbar(page);

  await expect(toolbar).toBeVisible();

  await page.keyboard.down('Space');

  await expect(toolbar).toBeHidden();

  await page.keyboard.up('Space');

  await expect(toolbar).toBeVisible();

  await page.keyboard.press('Delete');

  await expect(toolbar).toBeHidden();

  await page.keyboard.down('Space');

  await expect(toolbar).toBeHidden();

  await page.keyboard.up('Space');

  await expect(toolbar).toBeHidden();
});
