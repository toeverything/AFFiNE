import { toast } from '@affine/component';
import { Button, IconButton } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import type { ImageBlockModel } from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import {
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
  CloseIcon,
  CopyIcon,
  DeleteIcon,
  DownloadIcon,
  MinusIcon,
  PlusIcon,
  ViewBarIcon,
} from '@blocksuite/icons/rc';
import type { BlockModel } from '@blocksuite/store';
import { useService } from '@toeverything/infra';
import clsx from 'clsx';
import { fileTypeFromBuffer } from 'file-type';
import { useErrorBoundary } from 'foxact/use-error-boundary';
import type { PropsWithChildren, ReactElement } from 'react';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { ErrorBoundary } from 'react-error-boundary';
import useSWR from 'swr';

import { PeekViewService } from '../../services/peek-view';
import { useEditor } from '../utils';
import { useZoomControls } from './hooks/use-zoom';
import * as styles from './index.css';

const filterImageBlock = (block: BlockModel): block is ImageBlockModel => {
  return block.flavour === 'affine:image';
};

async function imageUrlToBlob(url: string): Promise<Blob | undefined> {
  const buffer = await fetch(url).then(response => {
    return response.arrayBuffer();
  });

  if (!buffer) {
    console.warn('Could not get blob');
    return;
  }
  try {
    const type = await fileTypeFromBuffer(buffer);
    if (!type) {
      return;
    }
    const blob = new Blob([buffer], { type: type.mime });
    return blob;
  } catch (error) {
    console.error('Error converting image to blob', error);
  }
  return;
}

async function copyImageToClipboard(url: string) {
  const blob = await imageUrlToBlob(url);
  if (!blob) {
    return;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    console.log('Image copied to clipboard');
    toast('Copied to clipboard.');
  } catch (error) {
    console.error('Error copying image to clipboard', error);
  }
}

async function saveBufferToFile(url: string, filename: string) {
  // given input url may not have correct mime type
  const blob = await imageUrlToBlob(url);
  if (!blob) {
    return;
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

export type ImagePreviewModalProps = {
  docId: string;
  blockId: string;
};

const ImagePreviewModalImpl = ({
  docId,
  blockId,
  onBlockIdChange,
  onClose,
}: ImagePreviewModalProps & {
  onBlockIdChange: (blockId: string) => void;
  onClose: () => void;
}): ReactElement | null => {
  const { doc, workspace } = useEditor(docId);
  const blocksuiteDoc = doc?.blockSuiteDoc;
  const docCollection = workspace.docCollection;
  const blockModel = useMemo(() => {
    const block = blocksuiteDoc?.getBlock(blockId);
    if (!block) {
      return null;
    }
    return block.model as ImageBlockModel;
  }, [blockId, blocksuiteDoc]);
  const caption = useMemo(() => {
    return blockModel?.caption ?? '';
  }, [blockModel?.caption]);
  const [blocks, setBlocks] = useState<ImageBlockModel[]>([]);
  const [cursor, setCursor] = useState(0);
  const zoomRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const {
    isZoomedBigger,
    handleDrag,
    handleDragStart,
    handleDragEnd,
    resetZoom,
    zoomIn,
    zoomOut,
    resetScale,
    currentScale,
  } = useZoomControls({ zoomRef, imageRef });

  const goto = useCallback(
    (index: number) => {
      const page = docCollection.getDoc(docId);
      assertExists(page);

      const block = blocks[index];

      if (!block) return;

      setCursor(index);
      onBlockIdChange(block.id);
      resetZoom();
    },
    [docCollection, docId, blocks, onBlockIdChange, resetZoom]
  );

  const deleteHandler = useCallback(
    (index: number) => {
      if (!blocksuiteDoc) {
        return;
      }

      let block = blocks[index];

      if (!block) return;
      const newBlocks = blocks.toSpliced(index, 1);
      setBlocks(newBlocks);

      blocksuiteDoc.deleteBlock(block);

      // next
      block = newBlocks[index];

      // prev
      if (!block) {
        index -= 1;
        block = newBlocks[index];

        if (!block) {
          onClose();
          return;
        }

        setCursor(index);
      }

      onBlockIdChange(block.id);

      resetZoom();
    },
    [blocksuiteDoc, blocks, onBlockIdChange, resetZoom, onClose]
  );

  const downloadHandler = useAsyncCallback(async () => {
    const url = imageRef.current?.src;
    if (url) {
      await saveBufferToFile(url, caption || blockModel?.id || 'image');
    }
  }, [caption, blockModel?.id]);

  const copyHandler = useAsyncCallback(async () => {
    const url = imageRef.current?.src;
    if (url) {
      await copyImageToClipboard(url);
    }
  }, []);

  useEffect(() => {
    if (!blockModel || !blocksuiteDoc) {
      return;
    }

    const prevs = blocksuiteDoc.getPrevs(blockModel).filter(filterImageBlock);
    const nexts = blocksuiteDoc.getNexts(blockModel).filter(filterImageBlock);

    const blocks = [...prevs, blockModel, ...nexts];
    setBlocks(blocks);
    setCursor(blocks.length ? prevs.length : 0);
  }, [setBlocks, blockModel, blocksuiteDoc]);

  const { data, error } = useSWR(['workspace', 'image', docId, blockId], {
    fetcher: ([_, __, pageId, blockId]) => {
      const page = docCollection.getDoc(pageId);
      assertExists(page);

      const block = page.getBlock(blockId);
      if (!block) {
        return null;
      }
      const blockModel = block.model as ImageBlockModel;
      return docCollection.blobSync.get(blockModel.sourceId as string);
    },
    suspense: true,
  });

  useEffect(() => {
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!blocksuiteDoc || !blockModel) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        const prevBlock = blocksuiteDoc
          .getPrevs(blockModel)
          .findLast(
            (block): block is ImageBlockModel =>
              block.flavour === 'affine:image'
          );
        if (prevBlock) {
          onBlockIdChange(prevBlock.id);
        }
      } else if (event.key === 'ArrowRight') {
        const nextBlock = blocksuiteDoc
          .getNexts(blockModel)
          .find(
            (block): block is ImageBlockModel =>
              block.flavour === 'affine:image'
          );
        if (nextBlock) {
          onBlockIdChange(nextBlock.id);
        }
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    const onCopyEvent = (event: ClipboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      copyHandler();
    };

    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('copy', onCopyEvent);
    return () => {
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('copy', onCopyEvent);
    };
  }, [blockModel, blocksuiteDoc, copyHandler, onBlockIdChange]);

  useErrorBoundary(error);

  const [prevData, setPrevData] = useState<string | null>(() => data);
  const [url, setUrl] = useState<string | null>(null);

  if (data === null) {
    return null;
  } else if (prevData !== data) {
    if (url) {
      URL.revokeObjectURL(url);
    }
    setUrl(URL.createObjectURL(data));

    setPrevData(data);
  } else if (!url) {
    setUrl(URL.createObjectURL(data));
  }
  if (!url) {
    return null;
  }
  return (
    <div
      data-testid="image-preview-modal"
      className={styles.imagePreviewModalStyle}
    >
      <div className={styles.imagePreviewTrap} onClick={onClose} />
      <div className={styles.imagePreviewModalContainerStyle}>
        <div
          className={clsx('zoom-area', { 'zoomed-bigger': isZoomedBigger })}
          ref={zoomRef}
        >
          <div className={styles.imagePreviewModalCenterStyle}>
            <img
              data-blob-id={blockId}
              data-testid="image-content"
              src={url}
              alt={caption}
              tabIndex={0}
              ref={imageRef}
              draggable={isZoomedBigger}
              onMouseDown={handleDragStart}
              onMouseMove={handleDrag}
              onMouseUp={handleDragEnd}
              onLoad={resetZoom}
            />
            {isZoomedBigger ? null : (
              <p
                data-testid="image-caption-zoomedout"
                className={styles.imagePreviewModalCaptionStyle}
              >
                {caption}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className={styles.imageBottomContainerStyle}>
        {isZoomedBigger && caption !== '' ? (
          <p
            data-testid={'image-caption-zoomedin'}
            className={styles.captionStyle}
          >
            {caption}
          </p>
        ) : null}
        <div className={styles.imagePreviewActionBarStyle}>
          <IconButton
            data-testid="previous-image-button"
            tooltip="Previous"
            icon={<ArrowLeftSmallIcon />}
            disabled={cursor < 1}
            onClick={() => goto(cursor - 1)}
          />
          <div className={styles.cursorStyle}>
            {`${blocks.length ? cursor + 1 : 0}/${blocks.length}`}
          </div>
          <IconButton
            data-testid="next-image-button"
            tooltip="Next"
            icon={<ArrowRightSmallIcon />}
            disabled={cursor + 1 === blocks.length}
            onClick={() => goto(cursor + 1)}
          />
          <div className={styles.dividerStyle}></div>
          <IconButton
            data-testid="fit-to-screen-button"
            tooltip="Fit to screen"
            icon={<ViewBarIcon />}
            onClick={() => resetZoom()}
          />
          <IconButton
            data-testid="zoom-out-button"
            tooltip="Zoom out"
            icon={<MinusIcon />}
            onClick={zoomOut}
          />
          <Button
            data-testid="reset-scale-button"
            tooltip="Reset scale"
            onClick={resetScale}
            variant="plain"
          >
            {`${(currentScale * 100).toFixed(0)}%`}
          </Button>

          <IconButton
            data-testid="zoom-in-button"
            tooltip="Zoom in"
            icon={<PlusIcon />}
            onClick={zoomIn}
          />
          <div className={styles.dividerStyle}></div>
          <IconButton
            data-testid="download-button"
            tooltip="Download"
            icon={<DownloadIcon />}
            onClick={downloadHandler}
          />
          <IconButton
            data-testid="copy-to-clipboard-button"
            tooltip="Copy to clipboard"
            icon={<CopyIcon />}
            onClick={copyHandler}
          />
          {blockModel && !blockModel.doc.readonly && (
            <>
              <div className={styles.dividerStyle}></div>
              <IconButton
                data-testid="delete-button"
                tooltip="Delete"
                icon={<DeleteIcon />}
                disabled={blocks.length === 0}
                onClick={() => deleteHandler(cursor)}
                variant="danger"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const ErrorLogger = (props: FallbackProps) => {
  console.error('image preview modal error', props.error);
  return null;
};

export const ImagePreviewErrorBoundary = (
  props: PropsWithChildren
): ReactElement => {
  return (
    <ErrorBoundary fallbackRender={ErrorLogger}>{props.children}</ErrorBoundary>
  );
};

export const ImagePreviewPeekView = (
  props: ImagePreviewModalProps
): ReactElement | null => {
  const [blockId, setBlockId] = useState<string | null>(props.blockId);
  const peekView = useService(PeekViewService).peekView;
  const onClose = useCallback(() => peekView.close(), [peekView]);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setBlockId(props.blockId);
  }, [props.blockId]);

  return (
    <ImagePreviewErrorBoundary>
      <Suspense>
        {blockId ? (
          <ImagePreviewModalImpl
            {...props}
            onClose={onClose}
            blockId={blockId}
            onBlockIdChange={setBlockId}
          />
        ) : null}
        <button
          ref={buttonRef}
          data-testid="image-preview-close-button"
          onClick={onClose}
          className={styles.imagePreviewModalCloseButtonStyle}
        >
          <CloseIcon />
        </button>
      </Suspense>
    </ImagePreviewErrorBoundary>
  );
};
