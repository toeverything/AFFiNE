import { setTimeout } from 'node:timers/promises';

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import fs from 'fs-extra';

export async function waitForLogMessage(
  page: Page,
  log: string
): Promise<boolean> {
  return new Promise(resolve => {
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text() === log) {
        resolve(true);
      }
    });
  });
}

export async function removeWithRetry(
  filePath: string,
  maxRetries = 5,
  delay = 500
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.remove(filePath);
      return true;
    } catch (err: any) {
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        await setTimeout(delay);
      } else {
        console.error(`Failed to delete file ${filePath}:`, err);
      }
    }
  }
  // Add a return statement here to ensure that a value is always returned
  return false;
}

export async function isContainedInBoundingBox(
  container: Locator,
  element: Locator,
  includeDescendant = false
) {
  const containerBox = await container.boundingBox();
  if (!containerBox) {
    throw new Error('Container bounding box not found');
  }
  const { x: cx, y: cy, width: cw, height: ch } = containerBox;

  const inside = async (el: Locator): Promise<boolean> => {
    const elBox = await el.boundingBox();
    if (!elBox) {
      throw new Error('Element bounding box not found');
    }
    const { x, y, width, height } = elBox;

    return x >= cx && x + width <= cx + cw && y >= cy && y + height <= cy + ch;
  };

  let isInside = await inside(element);
  if (!isInside) return false;

  if (includeDescendant) {
    const children = await element.locator('*:visible').all();
    for (const child of children) {
      isInside = await inside(child);
      if (!isInside) return false;
    }
  }
  return true;
}

/**
 * Click at a specific position relative to a locator's bounding box.
 *  * Ratios are NOT clamped:
 * - 0 ~ 1   : inside the bounding box
 * - < 0     : outside (left / top of the box)
 * - > 1     : outside (right / bottom of the box)
 *
 * @param locator The locator to click
 * @param options Optional click position ratios
 * @param options.xRatio Horizontal ratio relative to box width (not clamped), default is 0.5 (center)
 * @param options.yRatio Vertical ratio relative to box height (not clamped), default is 0.5 (center)
 */
export async function clickLocatorByRatio(
  page: Page,
  locator: Locator,
  { xRatio = 0.5, yRatio = 0.5 } = {}
) {
  const box = await getLocatorBox(locator);

  await page.mouse.click(
    box.x + box.width * xRatio,
    box.y + box.height * yRatio
  );
}

export async function dblclickLocatorByRatio(
  page: Page,
  locator: Locator,
  { xRatio = 0.5, yRatio = 0.5 } = {}
) {
  const box = await getLocatorBox(locator);

  await page.mouse.dblclick(
    box.x + box.width * xRatio,
    box.y + box.height * yRatio
  );
}

async function getLocatorBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`error getting locator's bounding box`);
  return box;
}
