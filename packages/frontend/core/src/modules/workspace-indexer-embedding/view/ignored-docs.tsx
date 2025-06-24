import { Loading } from '@affine/component';
import { DocsService } from '@affine/core/modules/doc';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { i18nTime } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import type React from 'react';

import type { IgnoredDoc } from '../types';
import {
  docItem,
  docItemIcon,
  docItemInfo,
  docItemTitle,
  excludeDocsWrapper,
} from './styles-css';

interface IgnoredDocsProps {
  ignoredDocs: IgnoredDoc[];
  isLoading: boolean;
}

interface DocItemProps {
  doc: IgnoredDoc;
}

const DocItem: React.FC<DocItemProps> = ({ doc }) => {
  const docDisplayService = useService(DocDisplayMetaService);
  const docService = useService(DocsService);
  const docTitle = docDisplayService.title$(doc.docId).value;
  const DocIcon = docDisplayService.icon$(doc.docId).value;
  const docRecord = useLiveData(docService.list.doc$(doc.docId));
  if (!docRecord) {
    return null;
  }
  const updatedDate = docRecord.meta$.value.updatedDate;
  const createdDate = docRecord.meta$.value.createDate;

  const updateDate = updatedDate
    ? i18nTime(updatedDate, {
        relative: true,
      })
    : '-';
  const createDate = createdDate
    ? i18nTime(createdDate, {
        absolute: {
          accuracy: 'day',
          noYear: true,
        },
      })
    : '-';

  return (
    <div
      className={docItem}
      data-testid="workspace-embedding-setting-ignore-docs-list-item"
    >
      <div className={docItemTitle}>
        <DocIcon className={docItemIcon} />
        <span className="ignore-doc-title" data-testid="ignore-doc-title">
          {docTitle}
        </span>
      </div>

      <div className={docItemInfo}>
        <span>{updateDate}</span>
        <span>{createDate}</span>
      </div>

      {/* <div className={docItemInfo}>
        <span>{doc.createdAt}</span>
        <Avatar name={doc.userName} url={doc.userAvatar} />
      </div> */}
    </div>
  );
};

export const IgnoredDocs: React.FC<IgnoredDocsProps> = ({
  ignoredDocs,
  isLoading,
}) => {
  return (
    <div
      className={excludeDocsWrapper}
      data-testid="workspace-embedding-setting-ignore-docs-list"
    >
      {isLoading ? (
        <Loading />
      ) : (
        ignoredDocs.map(doc => <DocItem key={doc.docId} doc={doc} />)
      )}
    </div>
  );
};
