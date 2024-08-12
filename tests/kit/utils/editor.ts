import { expect, type Page } from '@playwright/test';

export function locateModeSwitchButton(
  page: Page,
  mode: 'page' | 'edgeless',
  active?: boolean
) {
  // switch is implemented as RadioGroup button,
  // so we can use aria-checked to determine the active state
  const checkedSelector = active ? '[aria-checked="true"]' : '';

  return page.locator(
    `[data-testid="switch-${mode}-mode-button"]${checkedSelector}`
  );
}

export async function clickEdgelessModeButton(page: Page) {
  await locateModeSwitchButton(page, 'edgeless').click({ delay: 50 });
  await ensureInEdgelessMode(page);
}

export async function clickPageModeButton(page: Page) {
  await locateModeSwitchButton(page, 'page').click({ delay: 50 });
  await ensureInPageMode(page);
}

export async function ensureInPageMode(page: Page) {
  await expect(locateModeSwitchButton(page, 'page', true)).toBeVisible();
}

export async function ensureInEdgelessMode(page: Page) {
  await expect(locateModeSwitchButton(page, 'edgeless', true)).toBeVisible();
}

export async function getPageMode(page: Page): Promise<'page' | 'edgeless'> {
  if (await locateModeSwitchButton(page, 'page', true).isVisible()) {
    return 'page';
  }
  if (await locateModeSwitchButton(page, 'edgeless', true).isVisible()) {
    return 'edgeless';
  }
  throw new Error('Unknown mode');
}
