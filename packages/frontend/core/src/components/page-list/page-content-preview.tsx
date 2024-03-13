import type { DocCollection } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import { Suspense } from 'react';

import { useBlockSuitePagePreview } from './use-block-suite-page-preview';
import { useDocCollectionPage } from './use-block-suite-workspace-page';

interface PagePreviewInnerProps {
  docCollection: DocCollection;
  pageId: string;
}

const PagePreviewInner = ({
  docCollection: workspace,
  pageId,
}: PagePreviewInnerProps) => {
  const page = useDocCollectionPage(workspace, pageId);
  const previewAtom = useBlockSuitePagePreview(page);
  const preview = useAtomValue(previewAtom);
  return preview ? preview : null;
};

interface PagePreviewProps {
  docCollection: DocCollection;
  pageId: string;
}

export const PagePreview = ({ docCollection, pageId }: PagePreviewProps) => {
  return (
    <Suspense>
      <PagePreviewInner docCollection={docCollection} pageId={pageId} />
    </Suspense>
  );
};
