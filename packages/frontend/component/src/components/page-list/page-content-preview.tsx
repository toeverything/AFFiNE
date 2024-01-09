import type { Workspace } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import { Suspense } from 'react';

import { useBlockSuitePagePreview } from './use-block-suite-page-preview';
import { useBlockSuiteWorkspacePage } from './use-block-suite-workspace-page';

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
