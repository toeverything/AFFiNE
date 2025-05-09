import { Skeleton } from '@affine/component';
import { AttachmentViewer } from '@affine/core/blocksuite/attachment-viewer';
import { type Doc, DocsService } from '@affine/core/modules/doc';
import { type AttachmentBlockModel } from '@blocksuite/affine/model';
import { FrameworkScope, useLiveData, useService } from '@toeverything/infra';
import { type ReactElement, useLayoutEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { ViewIcon, ViewTitle } from '../../../../modules/workbench';
import { PageNotFound } from '../../404';
import * as styles from './index.css';

type AttachmentPageProps = {
  pageId: string;
  attachmentId: string;
};

const useLoadAttachment = (pageId: string, attachmentId: string) => {
  const docsService = useService(DocsService);
  const docRecord = useLiveData(docsService.list.doc$(pageId));
  const [doc, setDoc] = useState<Doc | null>(null);
  const [model, setModel] = useState<AttachmentBlockModel | null>(null);

  useLayoutEffect(() => {
    if (!docRecord) {
      return;
    }

    const { doc, release } = docsService.open(pageId);

    setDoc(doc);

    if (!doc.blockSuiteDoc.ready) {
      doc.blockSuiteDoc.load();
    }
    const dispose = doc.addPriorityLoad(10);

    doc
      .waitForSyncReady()
      .then(() => {
        const block = doc.blockSuiteDoc.getBlock(attachmentId);
        if (block) {
          setModel(block.model as AttachmentBlockModel);
        }
      })
      .catch(console.error);

    return () => {
      release();
      dispose();
    };
  }, [docRecord, docsService, pageId, attachmentId]);

  return { doc, model };
};

export const AttachmentPage = ({
  pageId,
  attachmentId,
}: AttachmentPageProps): ReactElement => {
  const { doc, model } = useLoadAttachment(pageId, attachmentId);

  if (!doc) {
    return <PageNotFound noPermission={false} />;
  }

  if (doc && model) {
    return (
      <FrameworkScope scope={doc.scope}>
        <ViewTitle title={model.props.name} />
        <ViewIcon
          icon={model.props.type.endsWith('pdf') ? 'pdf' : 'attachment'}
        />
        <AttachmentViewer model={model} />
      </FrameworkScope>
    );
  }

  return (
    <div className={styles.attachmentSkeletonStyle}>
      <Skeleton
        className={styles.attachmentSkeletonItemStyle}
        animation="wave"
        height={30}
      />
      <Skeleton
        className={styles.attachmentSkeletonItemStyle}
        animation="wave"
        height={30}
        width="80%"
      />
      <Skeleton
        className={styles.attachmentSkeletonItemStyle}
        animation="wave"
        height={30}
      />
      <Skeleton
        className={styles.attachmentSkeletonItemStyle}
        animation="wave"
        height={30}
        width="70%"
      />
      <Skeleton
        className={styles.attachmentSkeletonItemStyle}
        animation="wave"
        height={30}
      />
    </div>
  );
};

export const Component = () => {
  const { pageId, attachmentId } = useParams();

  if (!pageId || !attachmentId) {
    return <PageNotFound noPermission />;
  }

  return <AttachmentPage pageId={pageId} attachmentId={attachmentId} />;
};
