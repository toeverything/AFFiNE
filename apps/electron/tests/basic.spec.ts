import { expect } from '@playwright/test';

import { test } from './fixture';

test('new page', async ({ page, workspace }) => {
  await page.getByTestId('new-page-button').click({
    delay: 100,
  });
  await page.waitForSelector('v-line');
  const flavour = (await workspace.current()).flavour;
  expect(flavour).toBe('local');
});

test('app theme', async ({ page, electronApp }) => {
  await page.waitForSelector('v-line');
  const root = page.locator('html');
  {
    const themeMode = await root.evaluate(element =>
      element.getAttribute('data-theme')
    );
    expect(themeMode).toBe('light');

    // check if electron theme source is set to light
    const themeSource = await electronApp.evaluate(({ nativeTheme }) => {
      return nativeTheme.themeSource;
    });

    expect(themeSource).toBe('light');
  }

  {
    await page.getByTestId('editor-option-menu').click();
    await page.getByTestId('change-theme-dark').click();
    await page.waitForTimeout(50);
    {
      const themeMode = await root.evaluate(element =>
        element.getAttribute('data-theme')
      );
      expect(themeMode).toBe('dark');
    }

    const themeSource = await electronApp.evaluate(({ nativeTheme }) => {
      return nativeTheme.themeSource;
    });

    expect(themeSource).toBe('dark');
  }
});

test('affine cloud disabled', async ({ page }) => {
  await page.getByTestId('new-page-button').click({
    delay: 100,
  });
  await page.waitForSelector('v-line');
  await page.getByTestId('current-workspace').click();
  await page.getByTestId('sign-in-button').click();
  await page.getByTestId('disable-affine-cloud-modal').waitFor({
    state: 'visible',
  });
});

test('affine onboarding button', async ({ page }) => {
  await page.getByTestId('help-island').click();
  await page.getByTestId('easy-guide').click();
  const onboardingModal = page.locator('[data-testid=onboarding-modal]');
  expect(await onboardingModal.isVisible()).toEqual(true);
  const switchVideo = page.locator(
    '[data-testid=onboarding-modal-switch-video]'
  );
  expect(await switchVideo.isVisible()).toEqual(true);
  await page.getByTestId('onboarding-modal-next-button').click();
  const editingVideo = page.locator(
    '[data-testid=onboarding-modal-editing-video]'
  );
  expect(await editingVideo.isVisible()).toEqual(true);
  await page.getByTestId('onboarding-modal-ok-button').click();

  expect(await onboardingModal.isVisible()).toEqual(false);
});
