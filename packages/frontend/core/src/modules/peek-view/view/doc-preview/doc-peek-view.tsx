import { Scrollable } from '@affine/component';
import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import { AIProvider } from '@affine/core/blocksuite/presets/ai';
import { AffineErrorBoundary } from '@affine/core/components/affine/affine-error-boundary';
import { BlockSuiteEditor } from '@affine/core/components/blocksuite/block-suite-editor';
import { EditorOutlineViewer } from '@affine/core/components/blocksuite/outline-viewer';
import { PageNotFound } from '@affine/core/desktop/pages/404';
import { EditorService } from '@affine/core/modules/editor';
import { DebugLogger } from '@affine/debug';
import {
  type DocMode,
  type EdgelessRootService,
  RefNodeSlotsProvider,
} from '@blocksuite/affine/blocks';
import { Bound, DisposableGroup } from '@blocksuite/affine/global/utils';
import type { AffineEditorContainer } from '@blocksuite/affine/presets';
import {
  FrameworkScope,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useEffect } from 'react';

import { WorkbenchService } from '../../../workbench';
import { PeekViewService } from '../../services/peek-view';
import { useEditor } from '../utils';
import * as styles from './doc-peek-view.css';

const logger = new DebugLogger('doc-peek-view');

function fitViewport(
  editor: AffineEditorContainer,
  xywh?: `[${number},${number},${number},${number}]`
) {
  try {
    if (!editor.host) {
      throw new Error('editor host is not ready');
    }

    const rootService =
      editor.host.std.getService<EdgelessRootService>('affine:page');
    if (!rootService) {
      return;
    }
    rootService.viewport.onResize();

    if (xywh) {
      const viewport = {
        xywh: xywh,
        padding: [60, 20, 20, 20] as [number, number, number, number],
      };
      rootService.viewport.setViewportByBound(
        Bound.deserialize(viewport.xywh),
        viewport.padding,
        false
      );
    } else {
      const data = rootService.getFitToScreenData();
      rootService.viewport.setViewport(
        data.zoom,
        [data.centerX, data.centerY],
        false
      );
    }
  } catch (e) {
    logger.warn('failed to fitViewPort', e);
  }
}

function DocPeekPreviewEditor({
  xywh,
}: {
  xywh?: `[${number},${number},${number},${number}]`;
}) {
  const { editorService } = useServices({
    EditorService,
  });
  const editor = editorService.editor;
  const doc = editor.doc;
  const workspace = editor.doc.workspace;
  const mode = useLiveData(editor.mode$);
  const workbench = useService(WorkbenchService).workbench;
  const peekView = useService(PeekViewService).peekView;
  const editorElement = useLiveData(editor.editorContainer$);

  const handleOnEditorReady = useCallback(
    (editorContainer: AffineEditorContainer) => {
      if (!editorContainer.host) {
        return;
      }
      const disposableGroup = new DisposableGroup();
      const refNodeSlots =
        editorContainer.host.std.getOptional(RefNodeSlotsProvider);
      if (!refNodeSlots) return;
      // doc change event inside peek view should be handled by peek view
      disposableGroup.add(
        refNodeSlots.docLinkClicked.on(options => {
          peekView
            .open({
              type: 'doc',
              docId: options.pageId,
              ...options.params,
            })
            .catch(console.error);
        })
      );

      editor.setEditorContainer(editorContainer);
      const unbind = editor.bindEditorContainer(
        editorContainer,
        (editorContainer as any).title
      );

      if (mode === 'edgeless') {
        fitViewport(editorContainer, xywh);
      }

      return () => {
        unbind();
        editor.setEditorContainer(null);
        disposableGroup.dispose();
      };
    },
    [editor, mode, peekView, xywh]
  );

  useEffect(() => {
    const disposable = AIProvider.slots.requestOpenWithChat.on(() => {
      if (doc) {
        workbench.openDoc(doc.id);
        peekView.close();
        // chat panel open is already handled in <DetailPageImpl />
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [doc, peekView, workbench, workspace.id]);

  const openOutlinePanel = useCallback(() => {
    workbench.openDoc(doc.id);
    workbench.openSidebar();
    workbench.activeView$.value.activeSidebarTab('outline');
    peekView.close();
  }, [doc, peekView, workbench]);

  return (
    <AffineErrorBoundary>
      <Scrollable.Root>
        <Scrollable.Viewport
          className={clsx('affine-page-viewport', styles.affineDocViewport)}
        >
          <BlockSuiteEditor
            className={styles.editor}
            mode={mode}
            page={doc.blockSuiteDoc}
            onEditorReady={handleOnEditorReady}
          />
          <EditorOutlineViewer
            editor={editorElement}
            show={mode === 'page'}
            openOutlinePanel={openOutlinePanel}
          />
        </Scrollable.Viewport>

        <Scrollable.Scrollbar />
      </Scrollable.Root>
    </AffineErrorBoundary>
  );
}

export function DocPeekPreview({
  docId,
  blockIds,
  elementIds,
  mode,
  xywh,
}: {
  docId: string;
  blockIds?: string[];
  elementIds?: string[];
  mode?: DocMode;
  xywh?: `[${number},${number},${number},${number}]`;
}) {
  const { doc, editor, loading } = useEditor(docId, mode, {
    blockIds,
    elementIds,
  });

  // if sync engine has been synced and the page is null, show 404 page.
  if (!doc || !editor) {
    return loading ? (
      <PageDetailSkeleton key="current-page-is-null" />
    ) : (
      <PageNotFound noPermission />
    );
  }

  return (
    <FrameworkScope scope={doc.scope}>
      <FrameworkScope scope={editor.scope}>
        <DocPeekPreviewEditor xywh={xywh} />
      </FrameworkScope>
    </FrameworkScope>
  );
}
