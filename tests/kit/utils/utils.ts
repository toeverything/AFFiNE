import type { Page } from '@playwright/test';

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
