import type { Doc } from '@toeverything/infra';
import {
  DocsService,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { useEffect, useLayoutEffect, useState } from 'react';

export const useDoc = (pageId: string) => {
  const currentWorkspace = useService(WorkspaceService).workspace;
  const docsService = useService(DocsService);
  const docRecordList = docsService.list;
  const docListReady = useLiveData(docRecordList.isReady$);
  const docRecord = docRecordList.doc$(pageId).value;

  const [doc, setDoc] = useState<Doc | null>(null);

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

  // set sync engine priority target
  useEffect(() => {
    currentWorkspace.engine.doc.setPriority(pageId, 10);
    return () => {
      currentWorkspace.engine.doc.setPriority(pageId, 5);
    };
  }, [currentWorkspace, pageId]);

  return { doc, workspace: currentWorkspace, loading: !docListReady };
};
