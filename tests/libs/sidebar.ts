import type { Page } from '@playwright/test';

export async function clickSideBarSettingButton(page: Page) {
  return page.getByTestId('slider-bar-workspace-setting-button').click();
}

export async function clickSideBarAllPageButton(page: Page) {
  return page.getByTestId('all-pages').click();
}

export async function clickSideBarCurrentWorkspaceBanner(page: Page) {
  return page.getByTestId('current-workspace').click();
}

export async function clickNewPageButton(page: Page) {
  return page.getByTestId('new-page-button').click();
}
