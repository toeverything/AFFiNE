import { expect, type Locator } from '@playwright/test';

import {
  enterPlaygroundRoom,
  focusRichText,
  initEmptyParagraphState,
  pressEnter,
  pressTab,
  type,
} from './utils/actions/index.js';
import { test } from './utils/playwright.js';

const ARABIC = 'مرحبا بالعالم';

const direction = (locator: Locator) =>
  locator.evaluate(el => getComputedStyle(el).direction);

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('element is not visible');
  return rect;
};

test.describe('per-block automatic text direction', () => {
  test('paragraph direction follows its own content', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, ARABIC);
    await pressEnter(page);
    await type(page, 'hello world');

    const containers = page.locator('.affine-paragraph-block-container');
    await expect(containers).toHaveCount(2);
    await expect(containers.nth(0)).toHaveAttribute('dir', 'auto');
    await expect(containers.nth(1)).toHaveAttribute('dir', 'auto');
    expect(await direction(containers.nth(0))).toBe('rtl');
    expect(await direction(containers.nth(1))).toBe('ltr');
  });

  test('quote bar sits on the right of an Arabic quote', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, '> ');
    await type(page, ARABIC);

    const quote = page.locator('.affine-paragraph-rich-text-wrapper.quote');
    expect(await direction(quote)).toBe('rtl');

    // the quote bar is a ::after pseudo element anchored to the inline start
    const bar = await quote.evaluate(el => {
      const style = getComputedStyle(el, '::after');
      return { left: style.left, right: style.right };
    });
    expect(bar.right).toBe('0px');
    expect(bar.left).not.toBe('0px');

    const text = await box(quote.locator('rich-text'));
    const wrapper = await box(quote);
    // the 17px quote padding moved to the right side
    expect(wrapper.x + wrapper.width - (text.x + text.width)).toBeCloseTo(17);
    expect(text.x - wrapper.x).toBeCloseTo(0);
  });

  test('list marker and toggle sit on the right of an Arabic list', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, '- ');
    await type(page, ARABIC);
    await pressEnter(page);
    await pressTab(page);
    await type(page, ARABIC);

    const list = page.locator('.affine-list-block-container').first();
    await expect(list).toHaveAttribute('dir', 'auto');
    expect(await direction(list)).toBe('rtl');

    const wrapper = list.locator('.affine-list-rich-text-wrapper').first();
    const marker = await box(wrapper.locator('.affine-list-block__prefix'));
    const text = await box(wrapper.locator('rich-text'));
    expect(marker.x).toBeGreaterThanOrEqual(text.x + text.width);

    // the collapse toggle hangs outside the marker, on the right
    await wrapper.hover();
    const toggle = await box(wrapper.locator('.toggle-icon'));
    expect(toggle.x).toBeGreaterThanOrEqual(marker.x + marker.width);

    // the nested list is indented from the right
    const child = await box(list.locator('.affine-list-block-container'));
    const parent = await box(list);
    expect(child.x).toBeCloseTo(parent.x);
    expect(child.width).toBeLessThan(parent.width);
  });

  test('collapsed toggle chevron is mirrored in an Arabic list', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, '- ');
    await type(page, ARABIC);
    await pressEnter(page);
    await pressTab(page);
    await type(page, ARABIC);

    const wrapper = page.locator('.affine-list-rich-text-wrapper').first();
    await wrapper.hover();
    const toggle = wrapper.locator('.toggle-icon');
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-collapsed', 'true');

    const transform = await toggle
      .locator('svg')
      .evaluate(el => getComputedStyle(el).transform);
    expect(transform).toBe('matrix(-1, 0, 0, 1, 0, 0)');
  });

  test('heading icon sits on the right of an Arabic heading', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, '# ');
    await type(page, ARABIC);

    const wrapper = page.locator('.affine-paragraph-rich-text-wrapper.h1');
    expect(await direction(wrapper)).toBe('rtl');

    const icon = await box(wrapper.locator('.heading-icon'));
    const heading = await box(wrapper);
    expect(icon.x).toBeGreaterThanOrEqual(heading.x + heading.width);
  });
});
