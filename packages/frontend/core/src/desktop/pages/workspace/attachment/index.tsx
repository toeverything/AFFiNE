import { Skeleton } from '@affine/component';
import { AttachmentViewerView } from '@affine/core/blocksuite/attachment-viewer';
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
  const [loading, setLoading] = useState(true);
  const docsService = useService(DocsService);
  const docRecord = useLiveData(docsService.list.doc$(pageId));
  const [doc, setDoc] = useState<Doc | null>(null);
  const [model, setModel] = useState<AttachmentBlockModel | null>(null);

  useLayoutEffect(() => {
    if (!docRecord) {
      setLoading(false);
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
        const model =
          doc.blockSuiteDoc.getModelById<AttachmentBlockModel>(attachmentId);
        setModel(model);
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    return () => {
      release();
      dispose();
    };
  }, [docRecord, docsService, pageId, attachmentId, setLoading]);

  return { doc, model, loading };
};

const Loading = () => {
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

export const AttachmentPage = ({
  pageId,
  attachmentId,
}: AttachmentPageProps): ReactElement => {
  const { doc, model, loading } = useLoadAttachment(pageId, attachmentId);

  if (loading) {
    return <Loading />;
  }

  if (doc && model) {
    return (
      <FrameworkScope scope={doc.scope}>
        <ViewTitle title={model.props.name} />
        <ViewIcon
          icon={model.props.type.endsWith('pdf') ? 'pdf' : 'attachment'}
        />
        <AttachmentViewerView model={model} />
      </FrameworkScope>
    );
  }

  return <PageNotFound noPermission={false} />;
};

export const Component = () => {
  const { pageId, attachmentId } = useParams();

  if (pageId && attachmentId) {
    return <AttachmentPage pageId={pageId} attachmentId={attachmentId} />;
  }

  return <PageNotFound noPermission />;
};
