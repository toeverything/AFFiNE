import { AttachmentViewer } from '@affine/component/attachment-viewer';
import type { AttachmentBlockModel } from '@blocksuite/blocks';
import { type PropsWithChildren, Suspense, useMemo } from 'react';
import { ErrorBoundary,type FallbackProps } from 'react-error-boundary';

import { useEditor } from '../utils';

const ErrorLogger = (props: FallbackProps) => {
  console.error('image preview modal error', props.error);
  return null;
};

export const AttachmentPreviewErrorBoundary = (props: PropsWithChildren) => {
  return (
    <ErrorBoundary fallbackRender={ErrorLogger}>{props.children}</ErrorBoundary>
  );
};

export type AttachmentPreviewModalProps = {
  docId: string;
  blockId: string;
};

export const AttachmentPreviewPeekView = ({
  docId,
  blockId,
}: AttachmentPreviewModalProps) => {
  const { doc } = useEditor(docId);
  const blocksuiteDoc = doc?.blockSuiteDoc;
  const model = useMemo(() => {
    const block = blocksuiteDoc?.getBlock(blockId);
    if (block?.model) {
      return block.model as AttachmentBlockModel;
    }
    return null;
  }, [blockId, blocksuiteDoc]);

  return (
    <AttachmentPreviewErrorBoundary>
      <Suspense>{model ? <AttachmentViewer model={model} /> : null}</Suspense>
    </AttachmentPreviewErrorBoundary>
  );
};
