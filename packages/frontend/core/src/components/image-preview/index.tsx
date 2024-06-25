import { toast } from '@affine/component';
import { Button, IconButton } from '@affine/component/ui/button';
import { Tooltip } from '@affine/component/ui/tooltip';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { PeekViewModalContainer } from '@affine/core/modules/peek-view/view/modal-container';
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
import type { BlockModel, DocCollection } from '@blocksuite/store';
import clsx from 'clsx';
import { useErrorBoundary } from 'foxact/use-error-boundary';
import type { PropsWithChildren, ReactElement } from 'react';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { ErrorBoundary } from 'react-error-boundary';
import useSWR from 'swr';

import { useZoomControls } from './hooks/use-zoom';
import * as styles from './index.css';

const filterImageBlock = (block: BlockModel): block is ImageBlockModel => {
  return block.flavour === 'affine:image';
};

function resolveMimeType(buffer: Uint8Array): string {
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  } else if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  } else if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff &&
    buffer[3] === 0xe0
  ) {
    return 'image/jpeg';
  } else {
    // unknown, fallback to png
    console.error('unknown image type');
    return 'image/png';
  }
}

async function imageUrlToBlob(url: string): Promise<Blob | undefined> {
  const buffer = await fetch(url).then(response => {
    return response.arrayBuffer();
  });

  if (!buffer) {
    console.warn('Could not get blob');
    return;
  }
  try {
    const type = resolveMimeType(new Uint8Array(buffer));
    const blob = new Blob([buffer], { type });
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
  docCollection: DocCollection;
  pageId: string;
  host: HTMLElement;
};

const ButtonWithTooltip = ({
  icon,
  tooltip,
  disabled,
  ...props
}: PropsWithChildren<{
  disabled?: boolean;
  icon?: ReactElement;
  tooltip: string;
  onClick: () => void;
  className?: string;
}>) => {
  const element = icon ? (
    <IconButton icon={icon} type="plain" disabled={disabled} {...props} />
  ) : (
    <Button disabled={disabled} type="plain" {...props} />
  );
  if (disabled) {
    return element;
  } else {
    return <Tooltip content={tooltip}>{element}</Tooltip>;
  }
};

const ImagePreviewModalImpl = (
  props: ImagePreviewModalProps & {
    blockId: string;
    onBlockIdChange: (blockId: string | null) => void;
    onClose: () => void;
    animating: boolean;
  }
): ReactElement | null => {
  const page = useMemo(() => {
    return props.docCollection.getDoc(props.pageId);
  }, [props.docCollection, props.pageId]);
  const blockModel = useMemo(() => {
    const block = page?.getBlock(props.blockId);
    if (!block) {
      return null;
    }
    return block.model as ImageBlockModel;
  }, [page, props.blockId]);
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
      const workspace = props.docCollection;
      const page = workspace.getDoc(props.pageId);
      assertExists(page);

      const block = blocks[index];

      if (!block) return;

      setCursor(index);
      props.onBlockIdChange(block.id);
      resetZoom();
    },
    [props, blocks, resetZoom]
  );

  const deleteHandler = useCallback(
    (index: number) => {
      const { pageId, docCollection: workspace, onClose } = props;

      const page = workspace.getDoc(pageId);
      assertExists(page);

      let block = blocks[index];

      if (!block) return;
      const newBlocks = blocks.toSpliced(index, 1);
      setBlocks(newBlocks);

      page.deleteBlock(block);

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

      props.onBlockIdChange(block.id);

      resetZoom();
    },
    [props, blocks, setBlocks, setCursor, resetZoom]
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
    const page = props.docCollection.getDoc(props.pageId);
    assertExists(page);

    const block = page.getBlock(props.blockId);
    if (!block) {
      return;
    }
    const blockModel = block.model as ImageBlockModel;

    const prevs = page.getPrevs(blockModel).filter(filterImageBlock);
    const nexts = page.getNexts(blockModel).filter(filterImageBlock);

    const blocks = [...prevs, blockModel, ...nexts];
    setBlocks(blocks);
    setCursor(blocks.length ? prevs.length : 0);
  }, [props.blockId, props.pageId, props.docCollection, setBlocks]);

  const { data, error } = useSWR(
    ['workspace', 'image', props.pageId, props.blockId],
    {
      fetcher: ([_, __, pageId, blockId]) => {
        const page = props.docCollection.getDoc(pageId);
        assertExists(page);

        const block = page.getBlock(blockId);
        if (!block) {
          return null;
        }
        const blockModel = block.model as ImageBlockModel;
        return props.docCollection.blobSync.get(blockModel.sourceId as string);
      },
      suspense: true,
    }
  );

  useEffect(() => {
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!page || !blockModel) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        const prevBlock = page
          .getPrevs(blockModel)
          .findLast(
            (block): block is ImageBlockModel =>
              block.flavour === 'affine:image'
          );
        if (prevBlock) {
          props.onBlockIdChange(prevBlock.id);
        }
      } else if (event.key === 'ArrowRight') {
        const nextBlock = page
          .getNexts(blockModel)
          .find(
            (block): block is ImageBlockModel =>
              block.flavour === 'affine:image'
          );
        if (nextBlock) {
          props.onBlockIdChange(nextBlock.id);
        }
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [blockModel, page, props]);

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
    <div className={styles.imagePreviewModalStyle}>
      <div className={styles.imagePreviewTrap} onClick={props.onClose} />
      <div className={styles.imagePreviewModalContainerStyle}>
        <div
          className={clsx('zoom-area', { 'zoomed-bigger': isZoomedBigger })}
          ref={zoomRef}
        >
          <div className={styles.imagePreviewModalCenterStyle}>
            <img
              data-blob-id={props.blockId}
              data-testid="image-content"
              src={url}
              alt={caption}
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
          <ButtonWithTooltip
            data-testid="previous-image-button"
            tooltip="Previous"
            icon={<ArrowLeftSmallIcon />}
            disabled={props.animating || cursor < 1}
            onClick={() => goto(cursor - 1)}
          />
          <div className={styles.cursorStyle}>
            {`${blocks.length ? cursor + 1 : 0}/${blocks.length}`}
          </div>
          <ButtonWithTooltip
            data-testid="next-image-button"
            tooltip="Next"
            icon={<ArrowRightSmallIcon />}
            disabled={props.animating || cursor + 1 === blocks.length}
            onClick={() => goto(cursor + 1)}
          />
          <div className={styles.dividerStyle}></div>
          <ButtonWithTooltip
            data-testid="fit-to-screen-button"
            tooltip="Fit to screen"
            icon={<ViewBarIcon />}
            disabled={props.animating}
            onClick={() => resetZoom()}
          />
          <ButtonWithTooltip
            data-testid="zoom-out-button"
            tooltip="Zoom out"
            icon={<MinusIcon />}
            disabled={props.animating}
            onClick={zoomOut}
          />
          <ButtonWithTooltip
            data-testid="reset-scale-button"
            tooltip="Reset scale"
            onClick={resetScale}
            disabled={props.animating}
          >
            {`${(currentScale * 100).toFixed(0)}%`}
          </ButtonWithTooltip>

          <ButtonWithTooltip
            data-testid="zoom-in-button"
            tooltip="Zoom in"
            icon={<PlusIcon />}
            disabled={props.animating}
            onClick={zoomIn}
          />
          <div className={styles.dividerStyle}></div>
          <ButtonWithTooltip
            data-testid="download-button"
            tooltip="Download"
            icon={<DownloadIcon />}
            disabled={props.animating}
            onClick={downloadHandler}
          />
          <ButtonWithTooltip
            data-testid="copy-to-clipboard-button"
            tooltip="Copy to clipboard"
            icon={<CopyIcon />}
            disabled={props.animating}
            onClick={copyHandler}
          />
          <div className={styles.dividerStyle}></div>
          <ButtonWithTooltip
            data-testid="delete-button"
            tooltip="Delete"
            icon={<DeleteIcon />}
            disabled={props.animating || blocks.length === 0}
            onClick={() => deleteHandler(cursor)}
          />
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

export const ImagePreviewModal = (
  props: ImagePreviewModalProps
): ReactElement | null => {
  const [show, setShow] = useState(false);
  const [blockId, setBlockId] = useState<string | null>(null);
  const isOpen = show && !!blockId;

  // todo: refactor this to use peek view service
  useLayoutEffect(() => {
    const handleDblClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'IMG') {
        const imageBlock = target.closest('affine-image');
        if (imageBlock) {
          const blockId = imageBlock.dataset.blockId;
          if (!blockId) return;
          setBlockId(blockId);
          setShow(true);
        }
      }
    };
    props.host.addEventListener('dblclick', handleDblClick);
    return () => {
      props.host.removeEventListener('dblclick', handleDblClick);
    };
  }, [props.host]);

  const [animating, setAnimating] = useState(false);

  return (
    <PeekViewModalContainer
      padding={false}
      onOpenChange={setShow}
      open={isOpen}
      animation="fade"
      onAnimationStart={() => setAnimating(true)}
      onAnimateEnd={() => setAnimating(false)}
      testId="image-preview-modal"
    >
      <ImagePreviewErrorBoundary>
        <Suspense>
          {blockId ? (
            <ImagePreviewModalImpl
              {...props}
              animating={animating}
              blockId={blockId}
              onBlockIdChange={setBlockId}
              onClose={() => setShow(false)}
            />
          ) : null}
          <button
            data-testid="image-preview-close-button"
            onClick={() => {
              setShow(false);
            }}
            className={styles.imagePreviewModalCloseButtonStyle}
          >
            <CloseIcon />
          </button>
        </Suspense>
      </ImagePreviewErrorBoundary>
    </PeekViewModalContainer>
  );
};
