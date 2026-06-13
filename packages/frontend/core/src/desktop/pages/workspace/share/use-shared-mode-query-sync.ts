import type { Editor } from '@affine/core/modules/editor';
import type { DocMode } from '@blocksuite/affine/model';
import { useLiveData } from '@toeverything/infra';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getSearchWithMode } from './share-page.utils';

export const useSharedModeQuerySync = ({
  editor,
  resolvedPublishMode,
}: {
  editor: Editor | null;
  resolvedPublishMode: DocMode | null;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPublishMode = useLiveData(editor?.mode$) ?? resolvedPublishMode;
  const previousPublishModeRef = useRef<DocMode | null>(null);

  useEffect(() => {
    if (!editor || !resolvedPublishMode) {
      return;
    }

    if (editor.mode$.value !== resolvedPublishMode) {
      editor.setMode(resolvedPublishMode);
    }
  }, [editor, resolvedPublishMode]);

  useEffect(() => {
    if (!currentPublishMode) {
      return;
    }

    if (previousPublishModeRef.current === null) {
      previousPublishModeRef.current = currentPublishMode;
      return;
    }

    if (previousPublishModeRef.current === currentPublishMode) {
      return;
    }

    previousPublishModeRef.current = currentPublishMode;

    const nextSearch = getSearchWithMode(location.search, currentPublishMode);
    if (nextSearch !== location.search) {
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch,
        },
        { replace: true }
      );
    }
  }, [currentPublishMode, location.pathname, location.search, navigate]);

  return currentPublishMode;
};
