import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import type { Editor } from '@affine/core/modules/editor';
import { EditorsService } from '@affine/core/modules/editor';
import { ViewService } from '@affine/core/modules/workbench/services/view';
import { type DocMode, DocModes } from '@blocksuite/blocks';
import type { Doc } from '@toeverything/infra';
import {
  DocsService,
  FrameworkScope,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import {
  type PropsWithChildren,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

import { PageNotFound } from '../../404';

const useLoadDoc = (pageId: string) => {
  const currentWorkspace = useService(WorkspaceService).workspace;
  const docsService = useService(DocsService);
  const docRecordList = docsService.list;
  const docListReady = useLiveData(docRecordList.isReady$);
  const docRecord = useLiveData(docRecordList.doc$(pageId));
  const viewService = useService(ViewService);

  const modeInQuery = useLiveData(
    viewService.view.queryString$<{ mode?: string }>().map(query => {
      if (query.mode && DocModes.includes(query.mode)) {
        return query.mode as DocMode;
      }
      return null;
    })
  );

  const [doc, setDoc] = useState<Doc | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorMode = useLiveData(editor?.mode$);

  useLayoutEffect(() => {
    if (!docRecord) {
      return;
    }
    const { doc: opened, release } = docsService.open(pageId);
    setDoc(opened);
    return () => {
      release();
    };
  }, [docRecord, docsService, pageId]);

  useLayoutEffect(() => {
    if (!doc) {
      return;
    }
    const editor = doc.scope
      .get(EditorsService)
      .createEditor(modeInQuery || doc.getPrimaryMode() || DocMode.Page);
    setEditor(editor);
    return () => {
      editor.dispose();
    };
  }, [doc, modeInQuery]);

  // update editor mode to queryString
  useEffect(() => {
    if (editorMode) {
      viewService.view.updateQueryString(
        {
          mode: editorMode,
        },
        {
          replace: true,
        }
      );
    }
  }, [editorMode, viewService.view]);

  // set sync engine priority target
  useEffect(() => {
    currentWorkspace.engine.doc.setPriority(pageId, 10);
    return () => {
      currentWorkspace.engine.doc.setPriority(pageId, 5);
    };
  }, [currentWorkspace, pageId]);

  const isInTrash = useLiveData(doc?.meta$.map(meta => meta.trash));

  useEffect(() => {
    if (doc && isInTrash) {
      currentWorkspace.docCollection.awarenessStore.setReadonly(
        doc.blockSuiteDoc.blockCollection,
        true
      );
    }
  }, [currentWorkspace.docCollection.awarenessStore, doc, isInTrash]);

  return {
    doc,
    editor,
    docListReady,
  };
};

/**
 * A common wrapper for detail page for both mobile and desktop page.
 * It only contains the logic for page loading, context setup, but not the page content.
 */
export const DetailPageWrapper = ({
  pageId,
  children,
}: PropsWithChildren<{ pageId: string }>) => {
  const { doc, editor, docListReady } = useLoadDoc(pageId);
  // if sync engine has been synced and the page is null, show 404 page.
  if (docListReady && !doc) {
    return <PageNotFound noPermission />;
  }

  if (!doc || !editor) {
    return <PageDetailSkeleton key="current-page-is-null" />;
  }

  return (
    <FrameworkScope scope={doc.scope}>
      <FrameworkScope scope={editor.scope}>{children}</FrameworkScope>
    </FrameworkScope>
  );
};
