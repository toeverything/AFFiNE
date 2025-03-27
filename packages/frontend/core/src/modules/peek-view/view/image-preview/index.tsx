import { Divider, Loading, toast } from '@affine/component';
import { Button, IconButton } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useI18n } from '@affine/i18n';
import type { ImageBlockModel } from '@blocksuite/affine/model';
import type { BlockModel, Workspace } from '@blocksuite/affine/store';
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
import { useService } from '@toeverything/infra';
import clsx from 'clsx';
import type { ImgHTMLAttributes, ReactElement } from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSWR from 'swr';

import {
  downloadResourceWithUrl,
  resourceUrlToBlob,
} from '../../../../utils/resource';
import { PeekViewService } from '../../services/peek-view';
import { useEditor } from '../utils';
import { useZoomControls } from './hooks/use-zoom';
import * as styles from './index.css';

const filterImageBlock = (block: BlockModel): block is ImageBlockModel => {
  return block.flavour === 'affine:image';
};

async function copyImageToClipboard(url: string) {
  const blob = await resourceUrlToBlob(url);
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

export type ImagePreviewModalProps = {
  docId: string;
  blockId: string;
};

function useImageBlob(
  docCollection: Workspace,
  docId: string,
  blockId: string
) {
  const { data, error, isLoading } = useSWR(
    ['workspace', 'image', docId, blockId],
    {
      fetcher: async ([_, __, pageId, blockId]) => {
        const page = docCollection.getDoc(pageId)?.getStore();
        const block = page?.getBlock(blockId);
        if (!block) {
          return null;
        }
        const blockModel = block.model as ImageBlockModel;
        return await docCollection.blobSync.get(
          blockModel.props.sourceId as string
        );
      },
      suspense: false,
    }
  );

  return { data, error, isLoading };
}

const ImagePreview = forwardRef<
  HTMLImageElement,
  {
    docCollection: Workspace;
    docId: string;
    blockId: string;
  } & ImgHTMLAttributes<HTMLImageElement>
>(function ImagePreview({ docCollection, docId, blockId, ...props }, ref) {
  const { data, error, isLoading } = useImageBlob(
    docCollection,
    docId,
    blockId
  );

  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const t = useI18n();

  useEffect(() => {
    let blobUrl = null;
    if (data) {
      blobUrl = URL.createObjectURL(data);
      setBlobUrl(blobUrl);
    }
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [data]);

  if (error) {
    return <div>{t['error.NOT_FOUND']()}</div>;
  }

  if (!blobUrl || isLoading) {
    return <Loading size={24} />;
  }

  return (
    <img
      data-blob-id={blockId}
      data-testid="image-content"
      src={blobUrl}
      ref={ref}
      {...props}
    />
  );
});

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
    return blockModel?.props.caption ?? '';
  }, [blockModel?.props.caption]);
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
      const block = blocks[index];

      if (!block) return;

      setCursor(index);
      onBlockIdChange(block.id);
      resetZoom();
    },
    [blocks, onBlockIdChange, resetZoom]
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
    const image = imageRef.current;
    if (!image?.src) return;
    const filename = caption || blockModel?.id || 'image';
    await downloadResourceWithUrl(image.src, filename);
  }, [caption, blockModel?.id]);

  const copyHandler = useAsyncCallback(async () => {
    const image = imageRef.current;
    if (!image?.src) return;
    await copyImageToClipboard(image.src);
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
            <ImagePreview
              data-blob-id={blockId}
              data-testid="image-content"
              docCollection={docCollection}
              docId={docId}
              blockId={blockId}
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
          <Divider size="thinner" orientation="vertical" />
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
          <Divider size="thinner" orientation="vertical" />
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
              <Divider size="thinner" orientation="vertical" />
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
    <>
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
    </>
  );
};
