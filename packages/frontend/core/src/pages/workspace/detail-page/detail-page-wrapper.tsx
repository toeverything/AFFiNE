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
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

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

  // We only read the querystring mode when entering, so use useState here.
  const [initialQueryStringSelector] = useState(() => {
    const { blockIds, elementIds } = queryString$.value;
    return { blockIds, elementIds };
  });

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
      .createEditor(
        modeInQuery || doc.getPrimaryMode() || ('page' as DocMode),
        initialQueryStringSelector
      );
    setEditor(editor);
    return () => {
      editor.dispose();
    };
  }, [doc, modeInQuery, initialQueryStringSelector]);

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
  skeleton,
  notFound,
}: PropsWithChildren<{
  pageId: string;
  skeleton: ReactNode;
  notFound: ReactNode;
}>) => {
  const { doc, editor, docListReady } = useLoadDoc(pageId);
  // if sync engine has been synced and the page is null, show 404 page.
  if (docListReady && !doc) {
    return notFound;
  }

  if (!doc || !editor) {
    return skeleton;
  }

  return (
    <FrameworkScope scope={doc.scope}>
      <FrameworkScope scope={editor.scope}>{children}</FrameworkScope>
    </FrameworkScope>
  );
};
