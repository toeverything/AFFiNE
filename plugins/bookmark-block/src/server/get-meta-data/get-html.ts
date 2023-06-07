import type { Page } from 'puppeteer';
import puppeteer from 'puppeteer';

import type { GetHTMLOptions } from './types';

async function getHTMLFromPage(page: Page) {
  return page.evaluate(() => {
    return document.documentElement.outerHTML;
  });
}

async function wait(ms: number) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export async function getHTMLByURL(
  url: string,
  options: GetHTMLOptions
): Promise<string> {
  const { timeout = 20000, shouldReGetHTML } = options;
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const timer = setTimeout(() => {
    browser.close();
  }, timeout);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  let html = '';

  async function loopHandle(page: Page) {
    html = await getHTMLFromPage(page);

    if (!shouldReGetHTML) {
      return html;
    }

    if (await shouldReGetHTML(html)) {
      await wait(1000);
      return loopHandle(page);
    } else {
      browser.close();
      clearTimeout(timer);
      return html;
    }
  }

  return loopHandle(page);
}
