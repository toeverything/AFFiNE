import { ContentParser } from '@blocksuite/blocks/content-parser';
import type { Page } from '@blocksuite/store';

const contentParserWeakMap = new WeakMap<Page, ContentParser>();

export function getContentParser(page: Page) {
  if (!contentParserWeakMap.has(page)) {
    contentParserWeakMap.set(
      page,
      new ContentParser(page, {
        imageProxyEndpoint: !environment.isDesktop
          ? runtimeConfig.imageProxyUrl
          : undefined,
      })
    );
  }
  return contentParserWeakMap.get(page) as ContentParser;
}
