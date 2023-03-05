import { Page } from '@playwright/test';

export async function clickSideBarSettingButton(page: Page) {
  await page.getByTestId('slider-bar-workspace-setting-button').click();
}
