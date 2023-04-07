import { DebugLogger } from '@affine/debug';
import markdown from '@affine/templates/Welcome-to-AFFiNE.md';
import { ContentParser } from '@blocksuite/blocks/content-parser';
import type { Page } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';

import type { BlockSuiteWorkspace } from '../shared';

const demoTitle = markdown
  .split('\n')
  .splice(0, 1)
  .join('')
  .replaceAll('#', '')
  .trim();

const demoText = markdown.split('\n').slice(1).join('\n');

const logger = new DebugLogger('init-page');

export function initPage(page: Page): void {
  logger.debug('initEmptyPage', page.id);
  // Add page block and surface block at root level
  const isFirstPage = page.meta.init === true;
  if (isFirstPage) {
    page.workspace.setPageMeta(page.id, {
      init: false,
    });
    _initPageWithDemoMarkdown(page);
  } else {
    _initEmptyPage(page);
  }
  page.resetHistory();
}

export function _initEmptyPage(page: Page, title?: string): void {
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text(title ?? ''),
  });
  page.addBlock('affine:surface', {}, null);
  const frameId = page.addBlock('affine:frame', {}, pageBlockId);
  page.addBlock('affine:paragraph', {}, frameId);
}

export function _initPageWithDemoMarkdown(page: Page): void {
  logger.debug('initPageWithDefaultMarkdown', page.id);
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text(demoTitle),
  });
  page.addBlock('affine:surface', {}, null);
  const frameId = page.addBlock('affine:frame', {}, pageBlockId);
  page.addBlock('affine:paragraph', {}, frameId);
  const contentParser = new ContentParser(page);
  contentParser.importMarkdown(demoText, frameId).then(() => {
    document.dispatchEvent(
      new CustomEvent('markdown:imported', {
        detail: {
          workspaceId: page.workspace.id,
          pageId: page.id,
        },
      })
    );
  });
  page.workspace.setPageMeta(page.id, { demoTitle });
}

export function ensureRootPinboard(blockSuiteWorkspace: BlockSuiteWorkspace) {
  const metas = blockSuiteWorkspace.meta.pageMetas;
  const rootMeta = metas.find(m => m.isRootPinboard);

  if (rootMeta) {
    return rootMeta.id;
  }

  const rootPinboardPage = blockSuiteWorkspace.createPage(nanoid());

  const title = `${blockSuiteWorkspace.meta.name}'s Pinboard`;

  _initEmptyPage(rootPinboardPage, title);

  blockSuiteWorkspace.meta.setPageMeta(rootPinboardPage.id, {
    isRootPinboard: true,
    title,
  });

  return rootPinboardPage.id;
}
