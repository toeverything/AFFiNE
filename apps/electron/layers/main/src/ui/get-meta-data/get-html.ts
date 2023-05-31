import { BrowserWindow } from 'electron';

import type { GetHTMLOptions } from './types';

async function getHTMLFromWindow(win: BrowserWindow): Promise<string> {
  return win.webContents
    .executeJavaScript(`document.documentElement.outerHTML;`)
    .then(html => html);
}

// For normal web pages, obtaining html can be done directly,
// but for some dynamic web pages, obtaining html should wait for the complete loading of web pages. shouldReGetHTML should be used to judge whether to obtain html again
export async function getHTMLByURL(
  url: string,
  options: GetHTMLOptions
): Promise<string> {
  return new Promise(resolve => {
    const { timeout = 10000, shouldReGetHTML } = options;
    const window = new BrowserWindow({
      show: false,
    });
    let html = '';
    window.loadURL(url);

    const timer = setTimeout(() => {
      resolve(html);
      window.close();
    }, timeout);

    async function loopHandle() {
      html = await getHTMLFromWindow(window);
      if (!shouldReGetHTML) {
        return html;
      }

      if (await shouldReGetHTML(html)) {
        setTimeout(loopHandle, 1000);
      } else {
        window.close();
        clearTimeout(timer);
        resolve(html);
      }
    }

    window.webContents.on('did-finish-load', async () => {
      loopHandle();
    });
  });
}
