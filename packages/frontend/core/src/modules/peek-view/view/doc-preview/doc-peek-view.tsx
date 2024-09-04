import { Scrollable } from '@affine/component';
import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import { AIProvider } from '@affine/core/blocksuite/presets/ai';
import { AffineErrorBoundary } from '@affine/core/components/affine/affine-error-boundary';
import { BlockSuiteEditor } from '@affine/core/components/blocksuite/block-suite-editor';
import { EditorOutlineViewer } from '@affine/core/components/blocksuite/outline-viewer';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { EditorService } from '@affine/core/modules/editor';
import { PageNotFound } from '@affine/core/pages/404';
import { DebugLogger } from '@affine/debug';
import type { DocMode, EdgelessRootService } from '@blocksuite/blocks';
import { Bound, DisposableGroup } from '@blocksuite/global/utils';
import type { AffineEditorContainer } from '@blocksuite/presets';
import {
  FrameworkScope,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';

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
  const { jumpToTag } = useNavigateHelper();
  const workbench = useService(WorkbenchService).workbench;
  const peekView = useService(PeekViewService).peekView;
  const [editorElement, setEditorElement] =
    useState<AffineEditorContainer | null>(null);

  const onRef = (editor: AffineEditorContainer) => {
    setEditorElement(editor);
  };

  useEffect(() => {
    editorElement?.updateComplete
      .then(() => {
        if (mode === 'edgeless') {
          fitViewport(editorElement, xywh);
        }
      })
      .catch(console.error);
    return;
  }, [editorElement, mode, xywh]);

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

  useEffect(() => {
    const disposableGroup = new DisposableGroup();
    if (editorElement) {
      editorElement.updateComplete
        .then(() => {
          if (!editorElement.host) {
            return;
          }

          const rootService = editorElement.host.std.getService('affine:page');
          // doc change event inside peek view should be handled by peek view
          disposableGroup.add(
            rootService.slots.docLinkClicked.on(options => {
              peekView
                .open({
                  type: 'doc',
                  docId: options.pageId,
                  ...options.params,
                })
                .catch(console.error);
            })
          );
          // TODO(@Peng): no tag peek view yet
          disposableGroup.add(
            rootService.slots.tagClicked.on(({ tagId }) => {
              jumpToTag(workspace.id, tagId);
              peekView.close();
            })
          );
        })
        .catch(console.error);
    }
    return () => {
      disposableGroup.dispose();
    };
  }, [editorElement, jumpToTag, peekView, workspace.id]);

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
            ref={onRef}
            className={styles.editor}
            mode={mode}
            page={doc.blockSuiteDoc}
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
