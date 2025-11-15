import { Loading, Tooltip, useConfirmModal } from '@affine/component';
import { Pagination } from '@affine/component/setting-components';
import { useI18n } from '@affine/i18n';
import { getAttachmentFileIconRC } from '@blocksuite/affine/components/icons';
import { cssVarV2 } from '@blocksuite/affine/shared/theme';
import { CloseIcon, WarningIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { useCallback } from 'react';

import { COUNT_PER_PAGE } from '../constants';
import type {
  AttachmentFile,
  ErrorAttachmentFile,
  PersistedAttachmentFile,
  UploadingAttachmentFile,
} from '../types';
import {
  getAttachmentId,
  isErrorAttachment,
  isPersistedAttachment,
  isUploadingAttachment,
} from '../utils';
import {
  attachmentError,
  attachmentItem,
  attachmentOperation,
  attachmentsWrapper,
  attachmentTitle,
} from './styles-css';

interface AttachmentsProps {
  attachments: AttachmentFile[];
  totalCount: number;
  onPageChange: (offset: number) => void;
  onDelete: (id: string) => void;
  disabled: boolean;
}

interface AttachmentItemProps {
  attachment: AttachmentFile;
  onDelete: (id: string) => void;
  disabled: boolean;
}

const UploadingItem: React.FC<{ attachment: UploadingAttachmentFile }> = ({
  attachment,
}) => {
  return (
    <div
      className={attachmentTitle}
      data-testid="workspace-embedding-setting-attachment-uploading-item"
    >
      <Loading />
      {attachment.fileName}
    </div>
  );
};

const ErrorItem: React.FC<{ attachment: ErrorAttachmentFile }> = ({
  attachment,
}) => {
  return (
    <Tooltip content={attachment.errorMessage}>
      <div
        className={attachmentTitle}
        data-testid="workspace-embedding-setting-attachment-error-item"
      >
        <WarningIcon />
        {attachment.fileName}
      </div>
    </Tooltip>
  );
};

const PersistedItem: React.FC<{ attachment: PersistedAttachmentFile }> = ({
  attachment,
}) => {
  const Icon = getAttachmentFileIconRC(attachment.mimeType);
  return (
    <div
      className={attachmentTitle}
      data-testid="workspace-embedding-setting-attachment-persisted-item"
    >
      <Icon style={{ marginRight: 4 }} />
      <span className="attachment-title-text">{attachment.fileName}</span>
    </div>
  );
};

const AttachmentItem: React.FC<AttachmentItemProps> = ({
  attachment,
  onDelete,
  disabled,
}) => {
  const t = useI18n();
  const { openConfirmModal } = useConfirmModal();

  const handleDelete = useCallback(() => {
    if (isErrorAttachment(attachment)) {
      onDelete(getAttachmentId(attachment));
      return;
    }

    openConfirmModal({
      title:
        t[
          'com.affine.settings.workspace.indexer-embedding.embedding.additional-attachments.remove-attachment.title'
        ](),
      description:
        t[
          'com.affine.settings.workspace.indexer-embedding.embedding.additional-attachments.remove-attachment.description'
        ](),
      confirmText: t['Confirm'](),
      confirmButtonOptions: {
        variant: 'error',
      },
      onConfirm: () => {
        onDelete(getAttachmentId(attachment));
      },
    });
  }, [onDelete, attachment, openConfirmModal, t]);

  return (
    <div
      className={clsx(attachmentItem, {
        [attachmentError]: isErrorAttachment(attachment),
      })}
      data-testid="workspace-embedding-setting-attachment-item"
    >
      {isUploadingAttachment(attachment) ? (
        <UploadingItem attachment={attachment} />
      ) : isErrorAttachment(attachment) ? (
        <ErrorItem attachment={attachment} />
      ) : isPersistedAttachment(attachment) ? (
        <PersistedItem attachment={attachment} />
      ) : null}
      {!disabled && (
        <div className={attachmentOperation}>
          <Tooltip
            content={t[
              'com.affine.settings.workspace.indexer-embedding.embedding.additional-attachments.remove-attachment.tooltip'
            ]()}
          >
            <CloseIcon
              data-testid="workspace-embedding-setting-attachment-delete-button"
              onClick={handleDelete}
              color={cssVarV2('icon/primary')}
              style={{ cursor: 'pointer' }}
            />
          </Tooltip>
        </div>
      )}
    </div>
  );
};

export const Attachments: React.FC<AttachmentsProps> = ({
  attachments,
  totalCount,
  onDelete,
  onPageChange,
  disabled,
}) => {
  const handlePageChange = useCallback(
    (offset: number) => {
      onPageChange(offset);
    },
    [onPageChange]
  );

  return (
    <div
      className={attachmentsWrapper}
      data-testid="workspace-embedding-setting-attachment-list"
    >
      {attachments.map(attachment => (
        <AttachmentItem
          key={getAttachmentId(attachment)}
          attachment={attachment}
          onDelete={onDelete}
          disabled={disabled}
        />
      ))}
      <Pagination
        totalCount={totalCount}
        countPerPage={COUNT_PER_PAGE}
        onPageChange={handlePageChange}
      />
    </div>
  );
};
