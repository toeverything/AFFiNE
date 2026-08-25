import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { type, waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect, type Page } from '@playwright/test';

import { createNewPage, gotoContentFromTitle } from './utils';

test.use({
  colorScheme: 'light',
});

const MERMAID_SNIPPET = '```mermaid graph TD;A-->B';

function srgbChannelToLinear(channel: number) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: number[]) {
  return (
    0.2126 * srgbChannelToLinear(rgb[0]) +
    0.7152 * srgbChannelToLinear(rgb[1]) +
    0.0722 * srgbChannelToLinear(rgb[2])
  );
}

function contrastRatio(a: number[], b: number[]) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgbString(value: string) {
  const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

async function sampleNodeStyles(page: Page) {
  return page
    .locator('mermaid-preview .mermaid-preview-svg svg g.node rect')
    .evaluateAll(rects =>
      rects.map(rect => {
        const style = getComputedStyle(rect);
        const parse = (value: string) => {
          const match = value.match(
            /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/
          );
          return match
            ? [Number(match[1]), Number(match[2]), Number(match[3])]
            : null;
        };
        return {
          fill: parse(style.fill),
          stroke: parse(style.stroke),
        };
      })
    );
}

async function samplePanelBackground(page: Page) {
  return page
    .locator('mermaid-preview .mermaid-preview-container')
    .evaluate(el => {
      const value = getComputedStyle(el).backgroundColor;
      const match = value.match(
        /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/
      );
      return match
        ? [Number(match[1]), Number(match[2]), Number(match[3])]
        : null;
    });
}

async function sampleTextFill(page: Page) {
  const value = await page
    .locator('mermaid-preview .mermaid-preview-svg svg text')
    .first()
    .evaluate(text => getComputedStyle(text).fill)
    .catch(() => null);
  return value ? parseRgbString(value) : null;
}

async function enableMermaidPreview(page: Page) {
  const code = page.locator('affine-code');
  const mermaidSvg = page.locator('mermaid-preview .mermaid-preview-svg svg');

  await openHomePage(page);
  await createNewPage(page);
  await waitForEditorLoad(page);
  await gotoContentFromTitle(page);
  await type(page, MERMAID_SNIPPET);
  await code.hover({
    position: {
      x: 155,
      y: 65,
    },
  });
  await page.getByText('Preview').click();
  await expect(mermaidSvg).toBeVisible({ timeout: 15_000 });
  return mermaidSvg;
}

async function toggleTheme(page: Page, triggerTestId: string) {
  await page.getByTestId('settings-modal-trigger').click();
  await page.getByTestId('appearance-panel-trigger').click();
  await page.waitForTimeout(50);
  await page.getByTestId(triggerTestId).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

async function waitForRerender(page: Page, previousSnapshot: string) {
  let current = '';
  await expect
    .poll(
      async () => {
        current = JSON.stringify(await sampleNodeStyles(page));
        return current;
      },
      { timeout: 15_000 }
    )
    .not.toBe(previousSnapshot);
  return JSON.parse(current) as Awaited<ReturnType<typeof sampleNodeStyles>>;
}

test.describe('Mermaid Preview Theme Adaptation', () => {
  test.setTimeout(90_000);

  test('diagram stays readable when toggling between light and dark', async ({
    page,
  }) => {
    const mermaidSvg = await enableMermaidPreview(page);

    const lightNodes = await sampleNodeStyles(page);
    expect(lightNodes.length).toBeGreaterThan(0);
    const lightPanel = (await samplePanelBackground(page)) ?? [255, 255, 255];
    const lightText = await sampleTextFill(page);

    for (const node of lightNodes) {
      expect(node.fill).not.toBeNull();
      if (node.fill) {
        expect(contrastRatio(node.fill, lightPanel)).toBeGreaterThan(1.05);
      }
      if (node.stroke) {
        expect(contrastRatio(node.stroke, lightPanel)).toBeGreaterThan(1.05);
      }
    }
    if (lightText && lightNodes[0].fill) {
      expect(contrastRatio(lightText, lightNodes[0].fill)).toBeGreaterThan(3);
    }

    await toggleTheme(page, 'dark-theme-trigger');
    const darkNodes = await waitForRerender(
      page,
      JSON.stringify(lightNodes)
    );
    const darkPanel = (await samplePanelBackground(page)) ?? [20, 20, 20];
    const darkText = await sampleTextFill(page);

    for (const node of darkNodes) {
      expect(node.fill).not.toBeNull();
      if (node.fill) {
        expect(contrastRatio(node.fill, darkPanel)).toBeGreaterThan(1.05);
      }
      if (node.stroke) {
        expect(contrastRatio(node.stroke, darkPanel)).toBeGreaterThan(1.05);
      }
    }
    if (darkText && darkNodes[0].fill) {
      expect(contrastRatio(darkText, darkNodes[0].fill)).toBeGreaterThan(3);
    }

    await toggleTheme(page, 'light-theme-trigger');
    await expect(mermaidSvg).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => JSON.stringify(await sampleNodeStyles(page)), {
        timeout: 15_000,
      })
      .not.toBe(JSON.stringify(darkNodes));
  });
});
