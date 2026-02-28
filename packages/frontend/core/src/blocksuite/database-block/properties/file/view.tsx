import { Popover, uniReactRoot } from '@affine/component';
import { Button } from '@affine/component/ui/button';
import { Menu, MenuItem } from '@affine/component/ui/menu';
import { PeekViewService } from '@affine/core/modules/peek-view';
import {
  type Cell,
  type CellRenderProps,
  createIcon,
  type DataViewCellLifeCycle,
  EditorHostKey,
} from '@blocksuite/affine/blocks/database';
import { openFilesWith } from '@blocksuite/affine/shared/utils';
import type { BlobEngine } from '@blocksuite/affine/sync';
import {
  DeleteIcon,
  DownloadIcon,
  FileIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from '@blocksuite/icons/rc';
import {
  computed,
  type ReadonlySignal,
  type Signal,
  signal,
} from '@preact/signals-core';
import {
  generateFractionalIndexingKeyBetween,
  useService,
} from '@toeverything/infra';
import { fileTypeFromBuffer, type FileTypeResult } from 'file-type';
import { nanoid } from 'nanoid';
import type { ForwardRefRenderFunction, MouseEvent, ReactNode } from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
} from 'react';

import { WorkspaceDialogService } from '../../../../modules/dialogs';
import { useSignalValue } from '../../../../modules/doc-info/utils';
import type { ImageData } from '../../../../modules/peek-view/view/image-preview';
import { CircularProgress } from '../../components/loading';
import { progressIconContainer } from '../../components/loading.css';
import type {
  FileCellJsonValueType,
  FileCellRawValueType,
  FileItemType,
} from './define';
import { filePropertyModelConfig } from './define';
import * as styles from './style.css';

interface FileUploadProgress {
  name: string;
  progress: number;
}

interface FileLoadData {
  blob: Blob;
  url: string;
  fileType?: FileTypeResult;
}

class FileUploadManager {
  private readonly uploadProgressMap: Map<string, Signal<FileUploadProgress>> =
    new Map();
  private readonly fileLoadMap: Map<string, Signal<FileLoadData | undefined>> =
    new Map();

  constructor(private readonly blobSync: BlobEngine) {}

  uploadFile(file: File, onComplete: (blobId?: string) => void): string {
    const tempId = nanoid();

    const progress = signal<FileUploadProgress>({
      progress: 0,
      name: file.name,
    });
    this.uploadProgressMap.set(tempId, progress);
    this.startUpload(file, tempId)
      .then(blobId => {
        this.uploadProgressMap.delete(tempId);
        onComplete?.(blobId);
      })
      .catch(() => {
        this.uploadProgressMap.delete(tempId);
        onComplete?.();
      });
    return tempId;
  }

  async startUpload(file: File, fileId: string): Promise<string | undefined> {
    let progress = this.uploadProgressMap.get(fileId);
    if (!progress) {
      return;
    }
    progress.value = {
      ...progress.value,
      progress: 10,
    };

    const arrayBuffer = await file.arrayBuffer();
    progress = this.uploadProgressMap.get(fileId);
    if (!progress) {
      return;
    }
    progress.value = {
      ...progress.value,
      progress: 30,
    };

    const blob = new Blob([arrayBuffer], {
      type: file.type,
    });

    this.simulateUploadProgress(fileId);

    const uploadedId = await this.blobSync.set(blob);
    progress = this.uploadProgressMap.get(fileId);
    if (!progress) {
      return;
    }
    progress.value = {
      ...progress.value,
      progress: 100,
    };

    return uploadedId;
  }

  getUploadProgress(
    fileId: string
  ): ReadonlySignal<FileUploadProgress> | undefined {
    return this.uploadProgressMap.get(fileId);
  }

  async getFileBlob(blobId: string): Promise<Blob | null> {
    return this.blobSync?.get(blobId);
  }

  getFileInfo(blobId: string): ReadonlySignal<FileLoadData | undefined> {
    let fileLoadData = this.fileLoadMap.get(blobId);
    if (fileLoadData) {
      return fileLoadData;
    }
    const blobPromise = this.getFileBlob(blobId);
    fileLoadData = signal<FileLoadData | undefined>(undefined);
    this.fileLoadMap.set(blobId, fileLoadData);
    blobPromise
      .then(async blob => {
        if (!blob) {
          return;
        }
        const fileType = await fileTypeFromBuffer(await blob.arrayBuffer());
        fileLoadData.value = {
          blob,
          url: URL.createObjectURL(blob),
          fileType,
        };
      })
      .catch(() => {});
    return fileLoadData;
  }

  private simulateUploadProgress(fileId: string): void {
    setTimeout(() => {
      const progress = this.uploadProgressMap.get(fileId);
      if (!progress || progress.value.progress >= 100) return;
      const next =
        (100 - progress.value.progress) / 10 + progress.value.progress;
      progress.value = {
        ...progress.value,
        progress: Math.min(next, 100),
      };
      this.simulateUploadProgress(fileId);
    }, 10);
  }

  dispose(): void {
    this.fileLoadMap.forEach(fileLoadData => {
      const url = fileLoadData.value?.url;
      if (url) {
        URL.revokeObjectURL(url);
      }
    });

    this.uploadProgressMap.clear();
    this.fileLoadMap.clear();
  }
}

type FileItemDoneType = FileItemType & {
  type: 'done';
};
type FileItemUploadingType = {
  id: string;
  type: 'uploading';
  name: string;
  order: string;
};
type FileItemRenderType = FileItemDoneType | FileItemUploadingType;

class FileCellManager {
  private readonly cell: Cell<FileCellRawValueType, FileCellJsonValueType, {}>;
  readonly selectCurrentCell: (editing: boolean) => void;
  private readonly blobSync?: BlobEngine;
  private readonly uploadingFiles = signal<
    Record<string, FileItemUploadingType>
  >({});
  readonly isEditing: ReadonlySignal<boolean>;
  readonly fileUploadManager: FileUploadManager | undefined;
  doneFiles = computed(() => this.cell.value$.value ?? {});

  get readonly() {
    return this.cell.property.readonly$;
  }

  constructor(
    props: CellRenderProps<{}, FileCellRawValueType, FileCellJsonValueType>,
    private readonly peekViewService: PeekViewService
  ) {
    this.cell = props.cell;
    this.selectCurrentCell = props.selectCurrentCell;
    this.isEditing = props.isEditing$;
    this.blobSync = this.cell?.view?.serviceGet
      ? this.cell.view.serviceGet(EditorHostKey)?.store.blobSync
      : undefined;

    this.fileUploadManager = this.blobSync
      ? new FileUploadManager(this.blobSync)
      : undefined;
  }

  dispose(): void {
    this.fileUploadManager?.dispose();
  }

  removeFile = (file: FileItemRenderType, e?: MouseEvent): void => {
    e?.stopPropagation();

    if (file.type === 'uploading') {
      const newTemp = { ...this.uploadingFiles.value };
      delete newTemp[file.id];
      this.uploadingFiles.value = newTemp;
      return;
    }

    const value = { ...this.cell.value$.value };
    delete value[file.id];
    this.cell.valueSet(value);
  };

  uploadFile = (file: File): void => {
    if (!this.fileUploadManager) {
      return;
    }
    const lastFile = this.fileList.value[this.fileList.value.length - 1];
    const order = generateFractionalIndexingKeyBetween(
      lastFile?.order || null,
      null
    );

    const fileId = this.fileUploadManager.uploadFile(file, blobId => {
      if (blobId) {
        this.cell.valueSet({
          ...this.cell.value$.value,
          [blobId]: {
            name: file.name,
            id: blobId,
            order,
            mime: this.fileUploadManager?.getFileInfo(blobId).value?.fileType
              ?.mime,
          },
        });
      }
      this.removeFile(tempFile);
    });
    const tempFile: FileItemUploadingType = {
      id: fileId,
      type: 'uploading',
      name: file.name,
      order,
    };
    this.uploadingFiles.value = {
      ...this.uploadingFiles.value,
      [fileId]: tempFile,
    };
  };

  fileList = computed(() => {
    const uploadingList = Object.values(this.uploadingFiles.value);
    const doneList = Object.values(this.doneFiles.value).map<FileItemDoneType>(
      file => ({
        ...file,
        type: 'done',
      })
    );
    return [...doneList, ...uploadingList].sort((a, b) =>
      a.order > b.order ? 1 : -1
    );
  });

  openPreview = (id: string) => {
    const imageList = this.fileList.value
      .filter(v => v.type === 'done')
      .map(v => ({
        ...v,
        ...this.fileUploadManager?.getFileInfo(v.id).value,
      }))
      .filter(v => SUPPORTED_IMAGE_MIME_TYPES.has(v?.fileType?.mime ?? ''));
    const getImageData = (index: number): ImageData | undefined => {
      const file = imageList[index];
      if (!file) return;
      const previousIndex = index - 1;
      const nextIndex = index + 1;
      const hasPrevious = previousIndex >= 0;
      const hasNext = nextIndex < imageList.length;
      return {
        index,
        url: file.url ?? '',
        caption: file.name,
        previous: hasPrevious ? () => getImageData(previousIndex) : undefined,
        next: hasNext ? () => getImageData(nextIndex) : undefined,
      };
    };
    const currentIndex = imageList.findIndex(v => v.id === id);
    if (currentIndex === -1) return;
    const imageData = getImageData(currentIndex);
    if (!imageData) return;
    this.peekViewService.peekView
      .open({
        type: 'image-list',
        data: {
          image: imageData,
          total: imageList.length,
        },
      })
      .catch(error => {
        console.error('Failed to open image list', error);
      });
  };
}

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/apng',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'image/tiff',
  'image/bmp',
  'image/vnd.microsoft.icon',
]);

const FileCellComponent: ForwardRefRenderFunction<
  DataViewCellLifeCycle,
  CellRenderProps<{}, FileCellRawValueType, FileCellJsonValueType>
> = (props, ref): ReactNode => {
  const peekView = useService(PeekViewService);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const manager = useMemo(() => new FileCellManager(props, peekView), []);

  useEffect(() => {
    return () => {
      manager.dispose();
    };
  }, [manager]);

  useImperativeHandle(
    ref,
    () => ({
      beforeEnterEditMode: () => {
        return true;
      },
      beforeExitEditingMode: () => {},
      afterEnterEditingMode: () => {},
      focusCell: () => true,
      blurCell: () => true,
      forceUpdate: () => {},
    }),
    []
  );
  const fileList = useSignalValue(manager.fileList);
  const isEditing = useSignalValue(manager.isEditing);
  const workspaceDialogService = useService(WorkspaceDialogService);
  const jumpToPricePlan = useCallback(() => {
    workspaceDialogService.open('setting', {
      activeTab: 'plans',
      scrollAnchor: 'cloudPricingPlan',
    });
  }, [workspaceDialogService]);
  const renderPopoverContent = () => {
    if (fileList.length === 0) {
      return (
        <div
          data-peek-view-wrapper="true"
          className={styles.uploadPopoverContainer}
        >
          <Button
            onClick={() => {
              openFilesWith()
                .then(files => {
                  files?.forEach(file => {
                    manager.uploadFile(file);
                  });
                })
                .catch(e => {
                  console.error(e);
                });
            }}
            variant="primary"
            className={styles.uploadButton}
          >
            Choose a file
          </Button>

          <div className={styles.fileInfoContainer}>
            <div className={styles.fileSizeInfo}>
              The maximum size per file is 100MB
            </div>
            <a className={styles.upgradeLink} onClick={jumpToPricePlan}>
              Upgrade to Pro
            </a>
          </div>
        </div>
      );
    }
    return (
      <div
        data-peek-view-wrapper="true"
        className={styles.filePopoverContainer}
      >
        <div className={styles.fileListContainer}>
          {fileList.map(file => (
            <FileListItem
              key={file.id}
              file={file}
              handleRemoveFile={manager.removeFile}
              manager={manager}
            />
          ))}
        </div>
        <div className={styles.uploadContainer}>
          <div
            onClick={() => {
              openFilesWith()
                .then(files => {
                  files?.forEach(file => {
                    manager.uploadFile(file);
                  });
                })
                .catch(e => {
                  console.error(e);
                });
            }}
            className={styles.uploadButtonStyle}
          >
            <PlusIcon className={styles.iconPrimary} width={20} height={20} />
            <span>Add a file or image</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ overflow: 'hidden' }}>
      <Popover
        open={isEditing}
        onOpenChange={open => {
          manager.selectCurrentCell(open);
        }}
        contentOptions={{
          className: styles.filePopoverContent,
        }}
        content={renderPopoverContent()}
      >
        <div></div>
      </Popover>
      <div className={styles.cellContainer}>
        {fileList.map(file => (
          <div key={file.id} className={styles.fileItemCell}>
            <FilePreview file={file} manager={manager} />
          </div>
        ))}
      </div>
    </div>
  );
};

const useFilePreview = (
  file: FileItemRenderType,
  manager: FileCellManager
): {
  preview: ReactNode;
  onPreview?: () => void;
  fileType: 'uploading' | 'loading' | 'image' | 'file';
} => {
  const fileUploadManager = manager.fileUploadManager;
  const uploadProgress = useSignalValue(
    file.type === 'uploading'
      ? fileUploadManager?.getUploadProgress(file.id)
      : undefined
  );
  const loadFileData = useSignalValue(
    file.type === 'done' ? fileUploadManager?.getFileInfo(file.id) : undefined
  );
  if (uploadProgress != null) {
    return {
      preview: (
        <div className={progressIconContainer}>
          <CircularProgress progress={uploadProgress.progress} />
        </div>
      ),
      fileType: 'uploading',
    };
  }
  const mime =
    loadFileData?.fileType?.mime ??
    (file.type === 'done' ? file.mime : undefined);
  if (mime && SUPPORTED_IMAGE_MIME_TYPES.has(mime)) {
    if (loadFileData == null) {
      return {
        preview: null,
        fileType: 'loading',
      };
    }
    const onPreview = () => {
      manager.openPreview(file.id);
    };
    return {
      onPreview,
      preview: (
        <img
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            onPreview();
          }}
          className={styles.imagePreviewIcon}
          src={loadFileData.url}
          alt={file.name}
        />
      ),
      fileType: 'image',
    };
  }

  return {
    preview: <FileIcon className={styles.iconPrimary} width={18} height={18} />,
    fileType: 'file',
  };
};

export const FileListItem = (props: {
  file: FileItemRenderType;
  handleRemoveFile: (file: FileItemRenderType, e?: MouseEvent) => void;
  manager: FileCellManager;
}) => {
  const { file, handleRemoveFile, manager } = props;
  const { preview, fileType, onPreview } = useFilePreview(file, manager);
  const fileUploadManager = manager.fileUploadManager;

  const handleDownloadFile = useCallback(
    async (fileId: string, e?: MouseEvent) => {
      e?.stopPropagation();

      try {
        const blob = await fileUploadManager?.getFileBlob(fileId);
        if (!blob) {
          console.error('Failed to download: blob not found');
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.append(a);
        a.click();

        setTimeout(() => {
          a.remove();
          URL.revokeObjectURL(url);
        }, 100);
      } catch (error) {
        console.error('Download failed', error);
      }
    },
    [fileUploadManager, file.name]
  );

  const menuItems = (
    <>
      {fileType === 'image' && (
        <MenuItem
          onClick={onPreview}
          prefixIcon={<FileIcon width={20} height={20} />}
        >
          Preview
        </MenuItem>
      )}
      {(fileType === 'file' || fileType === 'image') && (
        <MenuItem
          onClick={e => {
            void handleDownloadFile(file.id, e).catch(error => {
              console.error('Download failed:', error);
            });
          }}
          prefixIcon={<DownloadIcon width={20} height={20} />}
        >
          Download
        </MenuItem>
      )}
      <MenuItem
        onClick={e => {
          handleRemoveFile(file, e);
        }}
        type={'danger'}
        prefixIcon={<DeleteIcon width={20} height={20} />}
      >
        Delete
      </MenuItem>
    </>
  );

  return (
    <div className={styles.fileItem}>
      <div
        className={styles.fileItemContent}
        style={fileType === 'image' ? { cursor: 'pointer' } : undefined}
      >
        {fileType === 'image' ? (
          <div className={styles.fileItemImagePreview}>{preview}</div>
        ) : (
          <>
            {preview}
            <div className={styles.fileNameStyle}>{file.name}</div>
          </>
        )}
      </div>
      <Menu items={menuItems} rootOptions={{ modal: false }}>
        <div
          className={styles.menuButton}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <MoreHorizontalIcon width={16} height={16} />
        </div>
      </Menu>
    </div>
  );
};

const FilePreview = (props: {
  file: FileItemRenderType;
  manager: FileCellManager;
}) => {
  const { file, manager } = props;
  const { preview, fileType } = useFilePreview(file, manager);
  if (fileType === 'file') {
    return <div className={styles.filePreviewContainer}>{file.name}</div>;
  }
  if (fileType === 'image') {
    return (
      <div
        className={styles.imagePreviewContainer}
        style={{ cursor: 'pointer' }}
      >
        {preview}
      </div>
    );
  }
  return preview;
};

const FileCell = forwardRef(FileCellComponent);

export const filePropertyConfig = filePropertyModelConfig.createPropertyMeta({
  icon: createIcon('FileIcon'),
  cellRenderer: {
    view: uniReactRoot.createUniComponent(FileCell),
  },
});
