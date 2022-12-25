import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

test.describe('Local first default workspace', () => {
  test('Default workspace name', async ({ page }) => {
    const workspaceName = page.getByTestId('workspace-name');
    expect(await workspaceName.textContent()).toBe('AFFiNE');
  });

  test('Default workspace avatar', async ({ page }) => {
    const workspaceAvatar = page.getByTestId('workspace-avatar');
    expect(await workspaceAvatar.innerHTML()).toBe(
      '<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="39" height="39" rx="19.5" stroke="#6880FF" fill="#FFF"></rect><path fill-rule="evenodd" clip-rule="evenodd" d="M18.6303 8.79688L11.2559 29.8393H15.5752L20.2661 15.2858L24.959 29.8393H29.2637L21.8881 8.79688H18.6303Z" fill="#6880FF"></path></svg>'
    );
  });
});
