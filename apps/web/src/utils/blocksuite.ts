import { DebugLogger } from '@affine/debug';
import markdown from '@affine/templates/Welcome-to-AFFiNE.md';
import { ContentParser } from '@blocksuite/blocks/content-parser';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';

const demoTitle = markdown
  .split('\n')
  .splice(0, 1)
  .join('')
  .replaceAll('#', '')
  .trim();

const demoText = markdown.split('\n').slice(1).join('\n');

const logger = new DebugLogger('init-page');

export function initPage(page: Page, editor: Readonly<EditorContainer>): void {
  logger.debug('initEmptyPage', page.id);
  // Add page block and surface block at root level
  const isFirstPage = page.meta.init === true;
  if (isFirstPage) {
    page.workspace.setPageMeta(page.id, {
      init: false,
    });
    _initPageWithDemoMarkdown(page, editor);
  } else {
    _initEmptyPage(page, editor);
  }
  page.resetHistory();
}

export function _initEmptyPage(page: Page, _: Readonly<EditorContainer>) {
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text(''),
  });
  page.addBlock('affine:surface', {}, null);
  const frameId = page.addBlock('affine:frame', {}, pageBlockId);
  page.addBlock('affine:paragraph', {}, frameId);
}

export function _initPageWithDemoMarkdown(
  page: Page,
  editor: Readonly<EditorContainer>
): void {
  logger.debug('initPageWithDefaultMarkdown', page.id);
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text(demoTitle),
  });
  page.addBlock('affine:surface', {}, null);
  const frameId = page.addBlock('affine:frame', {}, pageBlockId);
  page.addBlock('affine:paragraph', {}, frameId);
  const contentParser = new ContentParser(page);
  contentParser.importMarkdown(demoText, frameId);
  page.workspace.setPageMeta(page.id, { demoTitle });
}
