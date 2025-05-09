import { setTimeout } from 'node:timers/promises';

import type { Locator, Page } from '@playwright/test';
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
