import type { Page } from '@playwright/test';

export async function clickSideBarSettingButton(page: Page) {
  return page.getByTestId('slider-bar-workspace-setting-button').click();
}

export async function clickSideBarAllPageButton(page: Page) {
  return page.getByTestId('all-pages').click();
}

export async function clickSideBarCurrentWorkspaceBanner(page: Page) {
  return page.getByTestId('current-workspace-card').click();
}

export async function clickSideBarUseAvatar(page: Page) {
  return page.getByTestId('sidebar-user-avatar').click();
}

export async function clickNewPageButton(page: Page) {
  return page.getByTestId('sidebar-new-page-button').click();
}
