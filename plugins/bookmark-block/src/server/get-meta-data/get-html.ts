import type { GetHTMLOptions } from './types';

// For normal web pages, obtaining html can be done directly,
// but for some dynamic web pages, obtaining html should wait for the complete loading of web pages. shouldReGetHTML should be used to judge whether to obtain html again
export async function getHTMLByURL(
  url: string,
  options: GetHTMLOptions
): Promise<string> {
  const { timeout = 10000, shouldReGetHTML } = options;

  let html = '';
  let shouldRetry = true;
  const startTime = Date.now();

  while (shouldRetry && Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url);
      html = await response.text();
      shouldRetry = shouldReGetHTML ? await shouldReGetHTML(html) : false;

      if (shouldRetry) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      shouldRetry = false;
    }
  }

  return html;
}
