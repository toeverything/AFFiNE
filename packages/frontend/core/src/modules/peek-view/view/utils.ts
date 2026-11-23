import type { DefaultOpenProperty } from '@affine/core/components/properties';
import type { DocMode } from '@blocksuite/affine/model';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { Doc } from '../../doc';
import { DocsService } from '../../doc';
import { type Editor, type EditorSelector, EditorsService } from '../../editor';
import { WorkspaceService } from '../../workspace';

export const useEditor = (
  pageId: string,
  preferMode?: DocMode,
  preferSelector?: EditorSelector,
  defaultOpenProperty?: DefaultOpenProperty,
  canLoad?: boolean
) => {
  const currentWorkspace = useService(WorkspaceService).workspace;
  const docsService = useService(DocsService);
  const docRecordList = docsService.list;
  const [loading, setLoading] = useState(false);
  const docListReady = useLiveData(docRecordList.isReady$);
  const docRecord = docRecordList.doc$(pageId).value;
  const preferModeRef = useRef(preferMode);
  const preferSelectorRef = useRef(preferSelector);
  const defaultOpenPropertyRef = useRef(defaultOpenProperty);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    if (!docRecord) {
      return;
    }
    let canceled = false;
    let release: () => void;
    setLoading(true);
    const loaded = docsService.loaded(pageId);
    if (loaded) {
      setDoc(loaded.doc);
      release = loaded.release;
      setLoading(false);
    } else if (canLoad) {
      requestIdleCallback(
        () => {
          if (canceled) {
            return;
          }
          const { doc: opened, release: _release } = docsService.open(pageId);
          setDoc(opened);
          release = _release;
          setLoading(false);
        },
        {
          timeout: 1000,
        }
      );
    }
    return () => {
      canceled = true;
      release?.();
      setLoading(false);
    };
  }, [canLoad, docRecord, docsService, pageId]);

  useLayoutEffect(() => {
    if (!doc) {
      return;
    }
    const editor = doc.scope.get(EditorsService).createEditor();
    editor.setMode(preferModeRef.current || doc.primaryMode$.value);
    editor.setSelector(preferSelectorRef.current);
    editor.setDefaultOpenProperty(defaultOpenPropertyRef.current);
    setEditor(editor);
    return () => {
      editor.dispose();
    };
  }, [doc]);

  // set sync engine priority target
  useEffect(() => {
    return currentWorkspace.engine.doc.addPriority(pageId, 10);
  }, [currentWorkspace, pageId]);

  return {
    doc,
    editor,
    workspace: currentWorkspace,
    loading: !docListReady || loading,
  };
};
