// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../env.d.ts" />

import { DebugLogger } from '@affine/debug';
import preloadingData from '@affine/templates/affine-0.6.0-preloading.json';
import type { Page } from '@blocksuite/store';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { config } from '../src/config';

declare global {
  interface Window {
    lastImportedMarkdown: string;
  }
}

const logger = new DebugLogger('init-page');

function setEditorFlags(page: Page) {
  Object.entries(config.editorFlags).forEach(([key, value]) => {
    page.workspace.awarenessStore.setFlag(key as keyof BlockSuiteFlags, value);
  });
}

export function initPage(page: Page): void {
  logger.debug('initEmptyPage', page.id);
  setEditorFlags(page);
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
  page.addBlock('affine:surface', {}, pageBlockId);
  const frameId = page.addBlock('affine:frame', {}, pageBlockId);
  page.addBlock('affine:paragraph', {}, frameId);
}

export function _initPageWithDemoMarkdown(page: Page): void {
  logger.debug('initPageWithDefaultMarkdown', page.id);
  const workspace = page.workspace;
  workspace.importSnapshot(preloadingData.data, 'space:Qmo9-1SGTB');
}
