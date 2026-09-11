import {
  Button,
  Checkbox,
  Loading,
  notify,
  templateToString,
  useConfirmModal,
} from '@affine/component';
import { Pagination } from '@affine/component/setting-components';
import { BlobManagementService } from '@affine/core/modules/blob-management/services';
import { useI18n } from '@affine/i18n';
import type { ListedBlobRecord } from '@affine/nbstore';
import track from '@affine/track';
import { getAttachmentFileIcon } from '@blocksuite/affine/components/icons';
import { DeleteIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import bytes from 'bytes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as styles from './style.css';

const Empty = () => {
  const t = useI18n();
  return (
    <div className={styles.empty}>
      {t['com.affine.settings.workspace.storage.unused-blobs.empty']()}
    </div>
  );
};

const BlobPreview = ({ blobRecord }: { blobRecord: ListedBlobRecord }) => {
  const type = blobRecord.mime?.startsWith('text/')
    ? 'txt'
    : blobRecord.mime?.split('/')[1] || 'unknown';
  const icon = templateToString(getAttachmentFileIcon(type));

  return (
    <div className={styles.blobPreviewContainer}>
      <div className={styles.blobPreview}>
        <div
          className={styles.unknownBlobIcon}
          dangerouslySetInnerHTML={{ __html: icon }}
        />
      </div>
      <div className={styles.blobPreviewFooter}>
        <div className={styles.blobPreviewName}>{blobRecord.key}</div>
        <div className={styles.blobPreviewInfo}>
          {type !== 'unknown' ? `${type} · ` : ''}
          {bytes(blobRecord.size)}
        </div>
      </div>
    </div>
  );
};

const BlobCard = ({
  blobRecord,
  onClick,
  selected,
}: {
  blobRecord: ListedBlobRecord;
  onClick: (e: React.MouseEvent) => void;
  selected: boolean;
}) => {
  return (
    <div
      data-testid="blob-preview-card"
      className={styles.blobCard}
      data-selected={selected}
      onClick={onClick}
    >
      <Checkbox className={styles.blobGridItemCheckbox} checked={selected} />
      <BlobPreview blobRecord={blobRecord} />
    </div>
  );
};

const PAGE_SIZE = 9;
const DELETE_BATCH_SIZE = 5;

export const BlobManagementPanel = () => {
  const t = useI18n();

  const unusedBlobsEntity = useService(BlobManagementService).unusedBlobs;
  const originalUnusedBlobs = useLiveData(unusedBlobsEntity.unusedBlobs$);
  const isLoading = useLiveData(unusedBlobsEntity.isLoading$);
  const [pageNum, setPageNum] = useState(0);
  const [skip, setSkip] = useState(0);
  const [selectionAnchor, setSelectionAnchor] =
    useState<ListedBlobRecord | null>(null);

  const [unusedBlobs, setUnusedBlobs] = useState<ListedBlobRecord[]>([]);
  const [selectedBlobKeys, setSelectedBlobKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [deleting, setDeleting] = useState(false);
  const unusedBlobsPage = useMemo(() => {
    return unusedBlobs.slice(skip, skip + PAGE_SIZE);
  }, [unusedBlobs, skip]);

  useEffect(() => {
    setUnusedBlobs(originalUnusedBlobs);
    const availableBlobKeys = new Set(
      originalUnusedBlobs.map(blob => blob.key)
    );
    setSelectedBlobKeys(previous => {
      return new Set(
        Array.from(previous).filter(key => availableBlobKeys.has(key))
      );
    });
  }, [originalUnusedBlobs]);

  useEffect(() => {
    unusedBlobsEntity.revalidate();
  }, [unusedBlobsEntity]);

  const handleSelectBlob = useCallback((blob: ListedBlobRecord) => {
    setSelectedBlobKeys(previous => {
      if (previous.has(blob.key)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(blob.key);
      return next;
    });
  }, []);

  const handleUnselectBlob = useCallback((blob: ListedBlobRecord) => {
    setSelectedBlobKeys(previous => {
      const next = new Set(previous);
      next.delete(blob.key);
      return next;
    });
  }, []);

  const handleBlobClick = useCallback(
    (blob: ListedBlobRecord, event: React.MouseEvent) => {
      if (deleting) {
        return;
      }

      const isMetaKey = event.metaKey || event.ctrlKey;

      if (event.shiftKey && selectionAnchor) {
        // Shift+click: Select range from anchor to current
        const anchorIndex = unusedBlobsPage.findIndex(
          b => b.key === selectionAnchor.key
        );
        const currentIndex = unusedBlobsPage.findIndex(b => b.key === blob.key);

        if (anchorIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(anchorIndex, currentIndex);
          const end = Math.max(anchorIndex, currentIndex);
          const blobsToSelect = unusedBlobsPage.slice(start, end + 1);

          setSelectedBlobKeys(previous => {
            // If meta/ctrl is also pressed, add to existing selection
            const next = isMetaKey ? new Set(previous) : new Set<string>();
            blobsToSelect.forEach(item => next.add(item.key));
            return next;
          });
        }
      } else {
        if (selectedBlobKeys.has(blob.key)) {
          handleUnselectBlob(blob);
        } else {
          handleSelectBlob(blob);
        }
        if (selectedBlobKeys.size === 0) {
          setSelectionAnchor(selectedBlobKeys.has(blob.key) ? null : blob);
        }
      }
    },
    [
      deleting,
      selectionAnchor,
      unusedBlobsPage,
      selectedBlobKeys,
      handleSelectBlob,
      handleUnselectBlob,
    ]
  );

  const handleSelectAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (deleting) {
        return;
      }
      setSelectedBlobKeys(new Set(unusedBlobs.map(blob => blob.key)));
    },
    [deleting, unusedBlobs]
  );

  const showSelectAll = selectedBlobKeys.size < unusedBlobs.length;

  const { openConfirmModal } = useConfirmModal();

  const handleDeleteSelectedBlobs = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const currentSelectedBlobKeys = unusedBlobs
        .filter(blob => selectedBlobKeys.has(blob.key))
        .map(blob => blob.key);
      openConfirmModal({
        title: `${t[
          'com.affine.settings.workspace.storage.unused-blobs.delete.title'
        ]()} (${currentSelectedBlobKeys.length})`,
        children:
          t[
            'com.affine.settings.workspace.storage.unused-blobs.delete.warning'
          ](),
        onConfirm: async () => {
          setDeleting(true);
          track.$.settingsPanel.workspace.deleteUnusedBlob();
          const deletedBlobKeys = new Set<string>();
          const failedBlobKeys = new Set<string>();

          try {
            for (
              let index = 0;
              index < currentSelectedBlobKeys.length;
              index += DELETE_BATCH_SIZE
            ) {
              const batch = currentSelectedBlobKeys.slice(
                index,
                index + DELETE_BATCH_SIZE
              );
              const results = await Promise.allSettled(
                batch.map(key => unusedBlobsEntity.deleteBlob(key, true))
              );

              results.forEach((result, resultIndex) => {
                const key = batch[resultIndex];
                if (result.status === 'fulfilled') {
                  deletedBlobKeys.add(key);
                } else {
                  failedBlobKeys.add(key);
                }
              });
            }

            setUnusedBlobs(previous =>
              previous.filter(blob => !deletedBlobKeys.has(blob.key))
            );
            setSelectedBlobKeys(failedBlobKeys);

            if (failedBlobKeys.size > 0) {
              notify.error({
                title:
                  t[
                    'com.affine.settings.workspace.storage.unused-blobs.delete.failed'
                  ](),
              });
            }
          } finally {
            setDeleting(false);
          }
        },
        confirmText: t['Delete'](),
        cancelText: t['Cancel'](),
        confirmButtonOptions: {
          variant: 'error',
        },
      });
    },
    [selectedBlobKeys, unusedBlobs, openConfirmModal, t, unusedBlobsEntity]
  );

  const blobPreviewGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (blobPreviewGridRef.current) {
      const unselectBlobs = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!blobPreviewGridRef.current?.contains(target)) {
          setSelectedBlobKeys(new Set());
          setSelectionAnchor(null);
        }
      };
      document.addEventListener('click', unselectBlobs);
      return () => {
        document.removeEventListener('click', unselectBlobs);
      };
    }
    return;
  }, [unusedBlobs]);

  useEffect(() => {
    const lastPageNum = Math.max(
      0,
      Math.ceil(unusedBlobs.length / PAGE_SIZE) - 1
    );
    if (pageNum > lastPageNum) {
      setPageNum(lastPageNum);
      setSkip(lastPageNum * PAGE_SIZE);
    }
  }, [pageNum, unusedBlobs.length]);

  const isEmpty = (unusedBlobs.length === 0 || !unusedBlobs) && !isLoading;

  return (
    <>
      {selectedBlobKeys.size > 0 ? (
        <div className={styles.blobManagementControls}>
          <div className={styles.blobManagementName}>
            {`${selectedBlobKeys.size} ${t['com.affine.settings.workspace.storage.unused-blobs.selected']()}`}
          </div>
          <div className={styles.spacer} />
          {showSelectAll && (
            <Button
              onClick={handleSelectAll}
              variant="primary"
              disabled={deleting}
            >
              {`${t['com.affine.keyboardShortcuts.selectAll']()} (${unusedBlobs.length})`}
            </Button>
          )}
          <Button
            loading={deleting}
            onClick={handleDeleteSelectedBlobs}
            prefix={<DeleteIcon />}
            disabled={deleting}
          >
            {t['Delete']()}
          </Button>
        </div>
      ) : (
        <div className={styles.blobManagementNameInactive}>
          {`${t['com.affine.settings.workspace.storage.unused-blobs']()} (${unusedBlobs.length})`}
        </div>
      )}
      {isEmpty ? (
        <Empty />
      ) : (
        <div className={styles.blobManagementContainer}>
          {isLoading ? (
            <div className={styles.loadingContainer}>
              <Loading size={32} />
            </div>
          ) : (
            <>
              <div className={styles.blobPreviewGrid} ref={blobPreviewGridRef}>
                {unusedBlobsPage.map(blob => {
                  const selected = selectedBlobKeys.has(blob.key);
                  return (
                    <BlobCard
                      key={blob.key}
                      blobRecord={blob}
                      onClick={e => handleBlobClick(blob, e)}
                      selected={selected}
                    />
                  );
                })}
              </div>
              {unusedBlobs.length > PAGE_SIZE && (
                <Pagination
                  pageNum={pageNum}
                  totalCount={unusedBlobs.length}
                  countPerPage={PAGE_SIZE}
                  onPageChange={(_, pageNum) => {
                    setPageNum(pageNum);
                    setSkip(pageNum * PAGE_SIZE);
                  }}
                />
              )}
            </>
          )}
        </div>
      )}
    </>
  );
};
