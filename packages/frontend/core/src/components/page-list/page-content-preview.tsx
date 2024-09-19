import type { DocCollection } from '@blocksuite/affine/store';
import { useAtomValue } from 'jotai';
import { type ReactNode, Suspense } from 'react';

import { useBlockSuitePagePreview } from './use-block-suite-page-preview';
import { useDocCollectionPage } from './use-block-suite-workspace-page';

interface PagePreviewProps {
  docCollection: DocCollection;
  pageId: string;
  emptyFallback?: ReactNode;
}

const PagePreviewInner = ({
  docCollection: workspace,
  pageId,
  emptyFallback,
}: PagePreviewProps) => {
  const page = useDocCollectionPage(workspace, pageId);
  const previewAtom = useBlockSuitePagePreview(page);
  const preview = useAtomValue(previewAtom);
  const res = preview ? preview : null;
  return res || emptyFallback;
};

export const PagePreview = (props: PagePreviewProps) => {
  return (
    <Suspense>
      <PagePreviewInner {...props} />
    </Suspense>
  );
};
