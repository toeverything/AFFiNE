import { PageDetailSkeleton } from '@affine/component/page-detail-skeleton';
import { type Editor, EditorsService } from '@affine/core/modules/editor';
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

  const queryString$ = viewService.view.queryString$<{
    mode?: string;
    blockIds?: string[];
    elementIds?: string[];
  }>({
    // Cannot handle single id situation correctly: `blockIds=xxx`
    arrayFormat: 'none',
    types: {
      mode: 'string',
      blockIds: value => (value.length ? value.split(',') : []),
      elementIds: value => (value.length ? value.split(',') : []),
    },
  });

  const modeInQuery = useLiveData(
    queryString$.map(q => {
      if (q.mode && DocModes.includes(q.mode as DocMode)) {
        return q.mode as DocMode;
      }
      return null;
    })
  );

  const selectorInQuery = useLiveData(
    queryString$.map(q =>
      q.blockIds?.length || q.elementIds?.length
        ? {
            blockIds: q.blockIds,
            elementIds: q.elementIds,
          }
        : undefined
    )
  );

  const [doc, setDoc] = useState<Doc | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

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
    if (!editor) {
      return;
    }

    editor.setSelector(selectorInQuery);
  }, [editor, selectorInQuery]);

  useLayoutEffect(() => {
    if (!doc) {
      return;
    }

    const mode = modeInQuery || doc.getPrimaryMode() || ('page' as DocMode);
    const editor = doc.scope.get(EditorsService).createEditor(mode);
    setEditor(editor);
    return () => {
      editor.dispose();
    };
  }, [doc, modeInQuery]);

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
