import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  dragView,
  locateToolbar,
  setEdgelessTool,
} from '@affine-test/kit/utils/editor';
import { importImage } from '@affine-test/kit/utils/image';
import {
  selectAllByKeyboard,
  writeTextToClipboard,
} from '@affine-test/kit/utils/keyboard';
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

test('should not show inner toolbar of surface-ref in note under edgeless', async ({
  page,
}) => {
  await page.keyboard.press('Enter');
  await page.keyboard.type('/frame');
  await page.keyboard.press('Enter');

  const toolbar = locateToolbar(page);

  const surfaceRef = page.locator('affine-surface-ref');
  await surfaceRef.hover();

  await expect(toolbar).toBeVisible();

  await clickEdgelessModeButton(page);

  const note = page.locator('affine-edgeless-note');
  await note.click();
  await note.click();

  const edgelessSurfaceRef = note.locator('affine-edgeless-surface-ref');
  await edgelessSurfaceRef.hover();

  await expect(toolbar).toBeHidden();

  const dragHandler = page.locator('.affine-drag-handle-grabber');
  await dragHandler.hover();
  await dragHandler.click();

  await expect(
    edgelessSurfaceRef.locator('.affine-edgeless-surface-ref-container')
  ).toHaveClass(/focused$/);

  await expect(toolbar).toBeHidden();
});

test('should show toolbar when inline link is preceded by image or surface-ref', async ({
  page,
}) => {
  await page.keyboard.press('Enter');

  await importImage(page, 'affine-preview.png');

  const image = page.locator('affine-image');
  await image.click();

  await page.keyboard.press('Enter');

  const url = new URL(page.url());

  await writeTextToClipboard(page, url.toString());

  const toolbar = locateToolbar(page);

  const inlineLink = page.locator('affine-reference');

  await inlineLink.hover();
  await expect(toolbar).toBeVisible();

  await toolbar.hover();
  await expect(toolbar).toBeVisible();

  await image.hover();
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute('data-placement', 'inner');

  await inlineLink.hover();
  await expect(toolbar).toBeVisible();
  await expect(toolbar).not.toHaveAttribute('data-placement', 'inner');
});

test('should focus on input of popover on toolbar', async ({ page }) => {
  await clickEdgelessModeButton(page);

  const toolbar = locateToolbar(page);

  await expect(toolbar).toBeHidden();

  const note = page.locator('affine-edgeless-note').first();

  await note.click();

  await expect(toolbar).toBeVisible();

  const scaleMenu = toolbar.locator('.scale-menu');
  const scaleInput = scaleMenu.locator('input');
  const scaleButton = scaleMenu.getByLabel('Scale');

  await expect(scaleInput).toBeHidden();
  await scaleButton.click();

  await scaleInput.click();
  await expect(scaleInput).toBeFocused();

  await scaleInput.fill('150');
  await expect(scaleInput).toBeFocused();

  const scaleValue = await scaleInput.inputValue();
  expect(scaleValue).toBe('150');

  const stylePanelButton = toolbar.locator('edgeless-note-style-panel');
  const cornersInput = stylePanelButton.locator(
    '.edgeless-note-corner-radius-panel input'
  );

  await stylePanelButton.click();

  await cornersInput.click();
  await expect(cornersInput).toBeFocused();

  await cornersInput.fill('36');
  await expect(cornersInput).toBeFocused();

  const cornersValue = await cornersInput.inputValue();
  expect(cornersValue).toBe('36');
});

test('Dropdown menus should be closed automatically when toolbar is displayed', async ({
  page,
}) => {
  await page.keyboard.press('Enter');
  await page.keyboard.type('/frame');
  await page.keyboard.press('Enter');

  const toolbar = locateToolbar(page);

  const surfaceRef = page.locator('affine-surface-ref');
  await surfaceRef.hover();

  await expect(toolbar).toBeVisible();

  const moreMenuContainer = toolbar.getByLabel('More menu');
  const moreMenuButton = moreMenuContainer.getByLabel('More');
  const moreMenu = moreMenuContainer.getByRole('menu');

  await expect(moreMenu).toBeHidden();

  await moreMenuButton.click();

  await expect(moreMenu).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(toolbar).toBeHidden();

  await surfaceRef.hover();

  await expect(toolbar).toBeVisible();
  await expect(moreMenu).toBeHidden();
});

test('should clear selection when switching doc mode', async ({ page }) => {
  await page.keyboard.press('Enter');

  await page.keyboard.type('hello world');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');

  const toolbar = locateToolbar(page);

  await expect(toolbar).toBeVisible();

  await clickEdgelessModeButton(page);

  await expect(toolbar).toBeHidden();
});

test.describe('Toolbar More Actions', () => {
  test('should duplicate block', async ({ page }) => {
    await page.keyboard.press('Enter');

    await importImage(page, 'large-image.png');
    const images = page.locator('affine-page-image');

    const firstImage = images.first();
    const firstImageUrl = await firstImage.locator('img').getAttribute('src');

    await firstImage.hover();

    const toolbar = locateToolbar(page);
    const moreMenu = toolbar.getByLabel('More menu');
    await moreMenu.click();

    const duplicateButton = toolbar.getByTestId('duplicate');
    await duplicateButton.click();

    await expect(images).toHaveCount(2);

    const secondImage = images.nth(1);
    const secondImageUrl = await secondImage.locator('img').getAttribute('src');

    expect(firstImageUrl).not.toBeNull();
    expect(firstImageUrl!.startsWith('blob:')).toBe(true);

    expect(secondImageUrl).not.toBeNull();
    expect(secondImageUrl!.startsWith('blob:')).toBe(true);
  });
});
