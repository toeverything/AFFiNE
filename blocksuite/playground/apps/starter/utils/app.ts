import type { Store, Workspace } from '@blocksuite/affine/store';

import { AttachmentViewerPanel } from '../../_common/components/attachment-viewer-panel';
import { CustomFramePanel } from '../../_common/components/custom-frame-panel';
import { CustomOutlinePanel } from '../../_common/components/custom-outline-panel';
import { CustomOutlineViewer } from '../../_common/components/custom-outline-viewer';
import { DocsPanel } from '../../_common/components/docs-panel';
import { LeftSidePanel } from '../../_common/components/left-side-panel';
import { StarterDebugMenu } from '../../_common/components/starter-debug-menu';
import { CommentPanel } from '../../comment/comment-panel';
import { createTestEditor } from './extensions';

export async function createTestApp(doc: Store, collection: Workspace) {
  const app = document.querySelector('#app');
  if (!app) {
    throw new Error('Cannot find app root element(#app).');
  }
  const editor = createTestEditor(doc, collection);

  app.append(editor);
  await editor.updateComplete;

  const debugMenu = new StarterDebugMenu();
  const docsPanel = new DocsPanel();
  const framePanel = new CustomFramePanel();
  const outlinePanel = new CustomOutlinePanel();
  const outlineViewer = new CustomOutlineViewer();
  const leftSidePanel = new LeftSidePanel();
  const commentPanel = new CommentPanel();
  const attachmentViewerPanel = new AttachmentViewerPanel();

  docsPanel.editor = editor;
  framePanel.editor = editor;
  outlinePanel.editor = editor;
  outlineViewer.editor = editor;
  outlineViewer.toggleOutlinePanel = () => {
    outlinePanel.toggleDisplay();
  };

  debugMenu.collection = collection;
  debugMenu.editor = editor;
  debugMenu.outlinePanel = outlinePanel;
  debugMenu.outlineViewer = outlineViewer;
  debugMenu.framePanel = framePanel;
  debugMenu.leftSidePanel = leftSidePanel;
  debugMenu.docsPanel = docsPanel;

  debugMenu.commentPanel = commentPanel;

  commentPanel.editor = editor;

  document.body.append(attachmentViewerPanel);
  document.body.append(outlinePanel);
  document.body.append(outlineViewer);
  document.body.append(framePanel);
  document.body.append(leftSidePanel);
  document.body.append(debugMenu);

  window.editor = editor;
  window.doc = doc;
  Object.defineProperty(globalThis, 'host', {
    get() {
      return document.querySelector('editor-host');
    },
  });
  Object.defineProperty(globalThis, 'std', {
    get() {
      return document.querySelector('editor-host')?.std;
    },
  });

  return editor;
}
