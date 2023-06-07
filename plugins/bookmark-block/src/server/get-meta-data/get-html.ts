import type { Page } from 'puppeteer';
import puppeteer from 'puppeteer';

import type { GetHTMLOptions } from './types';

export async function getHTMLByURL(
  url: string,
  options: GetHTMLOptions
): Promise<string> {
  const { timeout = 10000, shouldReGetHTML } = options;
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  let html = '';
  async function loopHandle(page: Page) {
    html = await page.evaluate(() => {
      return document.documentElement.outerHTML;
    });
    if (!shouldReGetHTML) {
      return html;
    }

    if (await shouldReGetHTML(html)) {
      setTimeout(loopHandle, 1000);
    } else {
      window.close();
      clearTimeout(timer);
    }
  }

  const timer = setTimeout(() => {
    browser.close();
  }, timeout);

  await page.goto(url, { waitUntil: 'networkidle2' });

  return loopHandle(page);
}
