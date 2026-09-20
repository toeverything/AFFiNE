import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function expectActiveTab(
  page: Page,
  index: number,
  activeViewIndex = 0
) {
  await expect(
    page
      .getByTestId('workbench-tab')
      .nth(index)
      .getByTestId('split-view-label')
      .nth(activeViewIndex)
  ).toHaveAttribute('data-active', 'true');
}

export async function expectTabTitle(
  page: Page,
  index: number,
  title: string | string[],
  timeout?: number
) {
  if (typeof title === 'string') {
    await expect(page.getByTestId('workbench-tab').nth(index)).toContainText(
      title,
      { timeout }
    );
  } else {
    for (let i = 0; i < title.length; i++) {
      await expect(
        page
          .getByTestId('workbench-tab')
          .nth(index)
          .getByTestId('split-view-label')
          .nth(i)
      ).toContainText(title[i], { timeout });
    }
  }
}

export async function expectTabCount(page: Page, count: number) {
  await expect(page.getByTestId('workbench-tab')).toHaveCount(count);
}

export async function closeTab(page: Page, index: number) {
  await page.getByTestId('workbench-tab').nth(index).hover();

  await page
    .getByTestId('workbench-tab')
    .nth(index)
    .getByTestId('close-tab-button')
    .click();
}
