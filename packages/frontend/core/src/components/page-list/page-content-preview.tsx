import { DocsSearchService } from '@affine/core/modules/docs-search';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { type ReactNode, useEffect, useMemo } from 'react';

interface PagePreviewProps {
  pageId: string;
  emptyFallback?: ReactNode;
  fallback?: ReactNode;
}

const PagePreviewInner = ({
  pageId,
  emptyFallback,
  fallback,
}: PagePreviewProps) => {
  const docSummary = useService(DocsSearchService);
  const workspaceService = useService(WorkspaceService);
  const summary = useLiveData(
    useMemo(
      () => LiveData.from(docSummary.watchDocSummary(pageId), null),
      [docSummary, pageId]
    )
  );

  useEffect(() => {
    const undo = docSummary.indexer.addPriority(pageId, 100);
    return undo;
  }, [docSummary, pageId]);

  useEffect(() => {
    const undo = workspaceService.workspace.engine.doc.addPriority(pageId, 10);
    return undo;
  }, [workspaceService, pageId]);

  const res =
    summary === null ? fallback : summary === '' ? emptyFallback : summary;
  return res;
};

export const PagePreview = (props: PagePreviewProps) => {
  return <PagePreviewInner {...props} />;
};
