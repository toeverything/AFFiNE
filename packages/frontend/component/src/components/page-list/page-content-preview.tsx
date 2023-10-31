import type { Workspace } from '@blocksuite/store';
import { useBlockSuitePagePreview } from '@toeverything/hooks/use-block-suite-page-preview';
import { useBlockSuiteWorkspacePage } from '@toeverything/hooks/use-block-suite-workspace-page';
import { useAtomValue } from 'jotai';
import { Suspense } from 'react';

interface PagePreviewInnerProps {
  workspace: Workspace;
  pageId: string;
}

const PagePreviewInner = ({ workspace, pageId }: PagePreviewInnerProps) => {
  const page = useBlockSuiteWorkspacePage(workspace, pageId);
  const previewAtom = useBlockSuitePagePreview(page);
  const preview = useAtomValue(previewAtom);
  return preview ? preview : null;
};

interface PagePreviewProps {
  workspace: Workspace;
  pageId: string;
}

export const PagePreview = ({ workspace, pageId }: PagePreviewProps) => {
  return (
    <Suspense>
      <PagePreviewInner workspace={workspace} pageId={pageId} />
    </Suspense>
  );
};
