import type { Page } from '@playwright/test';

export async function getRichTextBoundingBox(
  page: Page,
  blockId: string
): Promise<DOMRect> {
  return page.evaluate(id => {
    const paragraph = document.querySelector(
      `[data-block-id="${id}"] .inline-editor`
    );
    const bbox = paragraph?.getBoundingClientRect() as DOMRect;
    return bbox;
  }, blockId);
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function clickInEdge(page: Page, rect: Rect) {
  const edgeX = rect.x + rect.width / 2;
  const edgeY = rect.y + rect.height - 5;
  await page.mouse.click(edgeX, edgeY);
}

export async function clickInCenter(page: Page, rect: Rect) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  await page.mouse.click(centerX, centerY);
}

export async function getBoundingRect(
  page: Page,
  selector: string
): Promise<Rect> {
  const div = page.locator(selector);
  const boundingRect = await div.boundingBox();
  if (!boundingRect) {
    throw new Error(`Missing ${selector}`);
  }
  return boundingRect;
}
