import { getDocTitleByEditorHost } from '@blocksuite/affine-fragment-doc-title';
import { NoteDisplayMode } from '@blocksuite/affine-model';
import { DocModeProvider } from '@blocksuite/affine-shared/services';
import type { Viewport } from '@blocksuite/affine-shared/types';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { clamp } from '@blocksuite/global/gfx';
import type { EditorHost } from '@blocksuite/std';

import { getHeadingBlocksFromDoc } from './query.js';

export function scrollToBlock(host: EditorHost, blockId: string) {
  const docModeService = host.std.get(DocModeProvider);
  const mode = docModeService.getEditorMode();
  if (mode === 'edgeless') return;

  if (host.store.root?.id === blockId) {
    const docTitle = getDocTitleByEditorHost(host);
    if (!docTitle) return;

    docTitle.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  } else {
    const block = host.view.getBlock(blockId);
    if (!block) return;
    block.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }
}

export function isBlockBeforeViewportCenter(
  blockId: string,
  editorHost: EditorHost
) {
  const block = editorHost.view.getBlock(blockId);
  if (!block) return false;

  const editorRect = (
    editorHost.parentElement ?? editorHost
  ).getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();

  const editorCenter =
    clamp(editorRect.top, 0, document.documentElement.clientHeight) +
    Math.min(editorRect.height, document.documentElement.clientHeight) / 2;

  const blockCenter = blockRect.top + blockRect.height / 2;

  return blockCenter < editorCenter + blockRect.height;
}

export const observeActiveHeadingDuringScroll = (
  getEditor: () => EditorHost, // workaround for editor changed
  update: (activeHeading: string | null) => void
) => {
  const handler = () => {
    const host = getEditor();

    const headings = getHeadingBlocksFromDoc(
      host.store,
      [NoteDisplayMode.DocAndEdgeless, NoteDisplayMode.DocOnly],
      true
    );

    let activeHeadingId = host.store.root?.id ?? null;
    headings.forEach(heading => {
      if (isBlockBeforeViewportCenter(heading.id, host)) {
        activeHeadingId = heading.id;
      }
    });
    update(activeHeadingId);
  };
  handler();

  const disposables = new DisposableGroup();
  disposables.addFromEvent(window, 'scroll', handler, true);

  return disposables;
};

let highlightMask: HTMLDivElement | null = null;
let highlightTimeoutId: ReturnType<typeof setTimeout> | null = null;

function highlightBlock(host: EditorHost, blockId: string) {
  const emptyClear = () => {};

  if (host.store.root?.id === blockId) return emptyClear;

  const rootComponent = host.querySelector<
    HTMLElement & { viewport: Viewport }
  >('affine-page-root');
  if (!rootComponent) return emptyClear;

  if (!rootComponent.viewport) {
    console.error('viewport should exist');
    return emptyClear;
  }

  const {
    top: offsetY,
    left: offsetX,
    scrollTop,
    scrollLeft,
  } = rootComponent.viewport;

  const block = host.view.getBlock(blockId);
  if (!block) return emptyClear;

  const blockRect = block.getBoundingClientRect();
  const { top, left, width, height } = blockRect;

  if (!highlightMask) {
    highlightMask = document.createElement('div');
    rootComponent.append(highlightMask);
  }

  Object.assign(highlightMask.style, {
    position: 'absolute',
    top: `${top - offsetY + scrollTop}px`,
    left: `${left - offsetX + scrollLeft}px`,
    width: `${width}px`,
    height: `${height}px`,
    background: 'var(--affine-hover-color)',
    borderRadius: '4px',
    display: 'block',
  });

  // Clear the previous timeout if it exists
  if (highlightTimeoutId !== null) {
    clearTimeout(highlightTimeoutId);
  }

  highlightTimeoutId = setTimeout(() => {
    if (highlightMask) {
      highlightMask.style.display = 'none';
    }
  }, 1000);

  return () => {
    if (highlightMask !== null) {
      highlightMask.remove();
      highlightMask = null;
    }
    if (highlightTimeoutId !== null) {
      clearTimeout(highlightTimeoutId);
      highlightTimeoutId = null;
    }
  };
}

// this function is useful when the scroll need smooth animation
let highlightIntervalId: ReturnType<typeof setInterval> | null = null;
export async function scrollToBlockWithHighlight(
  host: EditorHost,
  blockId: string,
  timeout = 3000
) {
  scrollToBlock(host, blockId);

  let timeCount = 0;

  return new Promise<ReturnType<typeof highlightBlock>>(resolve => {
    if (highlightIntervalId !== null) {
      clearInterval(highlightIntervalId);
    }

    // wait block be scrolled into view
    let lastTop = -1;
    highlightIntervalId = setInterval(() => {
      if (highlightIntervalId === null) {
        console.error('unreachable code');
        return;
      }

      const block = host.view.getBlock(blockId);

      if (!block || timeCount > timeout) {
        clearInterval(highlightIntervalId);
        resolve(() => {});
        return;
      }

      const blockRect = block.getBoundingClientRect();
      const { top } = blockRect;

      if (top !== lastTop) {
        timeCount += 100;
        lastTop = top;
        return;
      }

      clearInterval(highlightIntervalId);

      // highlight block
      resolve(highlightBlock(host, blockId));
    }, 100);
  });
}
