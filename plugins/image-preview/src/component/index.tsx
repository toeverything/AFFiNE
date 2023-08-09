import { Tooltip } from '@affine/component';
import type { ImageBlockModel } from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import {
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
  CopyIcon,
  DeleteIcon,
  DownloadIcon,
  MinusIcon,
  PlusIcon,
  ViewBarIcon,
} from '@blocksuite/icons';
import type { Workspace } from '@blocksuite/store';
import { Button, IconButton } from '@toeverything/components/button';
import clsx from 'clsx';
import { useErrorBoundary } from 'foxact/use-error-boundary';
import { useAtom } from 'jotai';
import type { PropsWithChildren, ReactElement } from 'react';
import { Suspense, useCallback } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { ErrorBoundary } from 'react-error-boundary';
import useSWR from 'swr';

import { useZoomControls } from './hooks/use-zoom';
import {
  buttonStyle,
  captionStyle,
  groupStyle,
  imageBottomContainerStyle,
  imagePreviewActionBarStyle,
  imagePreviewBackgroundStyle,
  imagePreviewModalCaptionStyle,
  imagePreviewModalCenterStyle,
  imagePreviewModalCloseButtonStyle,
  imagePreviewModalContainerStyle,
  imagePreviewModalStyle,
  loaded,
  scaleIndicatorButtonStyle,
  unloaded,
} from './index.css';
import { hasAnimationPlayedAtom, previewBlockIdAtom } from './index.jotai';
import { toast } from './toast';

export type ImagePreviewModalProps = {
  workspace: Workspace;
  pageId: string;
};

const ImagePreviewModalImpl = (
  props: ImagePreviewModalProps & {
    blockId: string;
    onClose: () => void;
  }
): ReactElement | null => {
  const [blockId, setBlockId] = useAtom(previewBlockIdAtom);
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
  const [isOpen, setIsOpen] = useAtom(hasAnimationPlayedAtom);
  const [hasPlayedAnimation, setHasPlayedAnimation] = useState<boolean>(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (!isOpen) {
      timeoutId = setTimeout(() => {
        props.onClose();
        setIsOpen(true);
      }, 300);

      return () => {
        clearTimeout(timeoutId);
      };
    }

    return () => {};
  }, [isOpen, props, setIsOpen]);

  const nextImageHandler = useCallback(
    (blockId: string | null) => {
      assertExists(blockId);
      const workspace = props.workspace;
      if (!hasPlayedAnimation) {
        setHasPlayedAnimation(true);
      }
      const page = workspace.getPage(props.pageId);
      assertExists(page);
      const block = page.getBlockById(blockId);
      assertExists(block);
      const nextBlock = page
        .getNextSiblings(block)
        .find(
          (block): block is ImageBlockModel => block.flavour === 'affine:image'
        );
      if (nextBlock) {
        setBlockId(nextBlock.id);
      }
    },
    [props.pageId, props.workspace, setBlockId, hasPlayedAnimation]
  );

  const previousImageHandler = useCallback(
    (blockId: string | null) => {
      assertExists(blockId);
      const workspace = props.workspace;
      const page = workspace.getPage(props.pageId);
      assertExists(page);
      const block = page.getBlockById(blockId);
      assertExists(block);
      const prevBlock = page
        .getPreviousSiblings(block)
        .findLast(
          (block): block is ImageBlockModel => block.flavour === 'affine:image'
        );
      if (prevBlock) {
        setBlockId(prevBlock.id);
      }
      resetZoom();
    },
    [props.pageId, props.workspace, setBlockId, resetZoom]
  );

  const deleteHandler = useCallback(
    (blockId: string) => {
      const { pageId, workspace, onClose } = props;

      const page = workspace.getPage(pageId);
      assertExists(page);
      const block = page.getBlockById(blockId);
      assertExists(block);
      if (
        page
          .getPreviousSiblings(block)
          .findLast(
            (block): block is ImageBlockModel =>
              block.flavour === 'affine:image'
          )
      ) {
        const prevBlock = page
          .getPreviousSiblings(block)
          .findLast(
            (block): block is ImageBlockModel =>
              block.flavour === 'affine:image'
          );
        if (prevBlock) {
          setBlockId(prevBlock.id);
        }
      } else if (
        page
          .getNextSiblings(block)
          .find(
            (block): block is ImageBlockModel =>
              block.flavour === 'affine:image'
          )
      ) {
        const nextBlock = page
          .getNextSiblings(block)
          .find(
            (block): block is ImageBlockModel =>
              block.flavour === 'affine:image'
          );
        if (nextBlock) {
          setBlockId(nextBlock.id);
        }
      } else {
        onClose();
      }
      page.deleteBlock(block);
    },
    [props, setBlockId]
  );

  const downloadHandler = useCallback(
    async (blockId: string | null) => {
      const workspace = props.workspace;
      const page = workspace.getPage(props.pageId);
      assertExists(page);
      if (typeof blockId === 'string') {
        const block = page.getBlockById(blockId) as ImageBlockModel;
        assertExists(block);
        const store = await block.page.blobs;
        const url = store?.get(block.sourceId);
        const img = await url;
        if (!img) {
          return;
        }
        const arrayBuffer = await img.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        let fileType: string;
        if (
          buffer[0] === 0x47 &&
          buffer[1] === 0x49 &&
          buffer[2] === 0x46 &&
          buffer[3] === 0x38
        ) {
          fileType = 'image/gif';
        } else if (
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47
        ) {
          fileType = 'image/png';
        } else if (
          buffer[0] === 0xff &&
          buffer[1] === 0xd8 &&
          buffer[2] === 0xff &&
          buffer[3] === 0xe0
        ) {
          fileType = 'image/jpeg';
        } else {
          // unknown, fallback to png
          console.error('unknown image type');
          fileType = 'image/png';
        }
        const downloadUrl = URL.createObjectURL(
          new Blob([arrayBuffer], { type: fileType })
        );
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = block.id ?? 'image';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    },
    [props.pageId, props.workspace]
  );
  const [caption, setCaption] = useState(() => {
    const page = props.workspace.getPage(props.pageId);
    assertExists(page);
    const block = page.getBlockById(props.blockId) as ImageBlockModel;
    assertExists(block);
    return block?.caption;
  });
  useEffect(() => {
    const page = props.workspace.getPage(props.pageId);
    assertExists(page);
    const block = page.getBlockById(props.blockId) as ImageBlockModel;
    assertExists(block);
    setCaption(block?.caption);
  }, [props.blockId, props.pageId, props.workspace]);
  const { data, error } = useSWR(
    ['workspace', 'image', props.pageId, props.blockId],
    {
      fetcher: ([_, __, pageId, blockId]) => {
        const page = props.workspace.getPage(pageId);
        assertExists(page);
        const block = page.getBlockById(blockId) as ImageBlockModel;
        assertExists(block);
        return props.workspace.blobs.get(block?.sourceId);
      },
      suspense: true,
    }
  );

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
      className={imagePreviewModalStyle}
      onClick={event => {
        if (event.target === event.currentTarget) {
          setIsOpen(false);
        }
      }}
    >
      <div className={imagePreviewModalContainerStyle}>
        <div
          className={clsx('zoom-area', { 'zoomed-bigger': isZoomedBigger })}
          ref={zoomRef}
        >
          <div className={imagePreviewModalCenterStyle}>
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
                className={imagePreviewModalCaptionStyle}
              >
                {caption}
              </p>
            )}
          </div>
        </div>
      </div>

      <div
        className={imageBottomContainerStyle}
        onClick={event => event.stopPropagation()}
      >
        {isZoomedBigger && caption !== '' ? (
          <p data-testid={'image-caption-zoomedin'} className={captionStyle}>
            {caption}
          </p>
        ) : null}
        <div className={imagePreviewActionBarStyle}>
          <div>
            <Tooltip content={'Previous'} disablePortal={false}>
              <IconButton
                data-testid="previous-image-button"
                icon={<ArrowLeftSmallIcon />}
                type="plain"
                className={buttonStyle}
                onClick={() => {
                  assertExists(blockId);
                  previousImageHandler(blockId);
                }}
              />
            </Tooltip>
            <Tooltip content={'Next'} disablePortal={false}>
              <IconButton
                data-testid="next-image-button"
                icon={<ArrowRightSmallIcon />}
                className={buttonStyle}
                type="plain"
                onClick={() => {
                  assertExists(blockId);
                  nextImageHandler(blockId);
                }}
              />
            </Tooltip>
          </div>
          <div className={groupStyle}></div>
          <Tooltip
            content={'Fit to Screen'}
            disablePortal={true}
            showArrow={false}
          >
            <IconButton
              data-testid="fit-to-screen-button"
              icon={<ViewBarIcon />}
              type="plain"
              className={buttonStyle}
              onClick={() => resetZoom()}
            />
          </Tooltip>
          <Tooltip content={'Zoom out'} disablePortal={false}>
            <IconButton
              data-testid="zoom-out-button"
              icon={<MinusIcon />}
              className={buttonStyle}
              type="plain"
              onClick={zoomOut}
            />
          </Tooltip>
          <Tooltip content={'Reset Scale'} disablePortal={false}>
            <Button
              data-testid="reset-scale-button"
              type="plain"
              size={'large'}
              className={scaleIndicatorButtonStyle}
              onClick={resetScale}
            >
              {`${(currentScale * 100).toFixed(0)}%`}
            </Button>
          </Tooltip>
          <Tooltip content={'Zoom in'} disablePortal={false}>
            <IconButton
              data-testid="zoom-in-button"
              icon={<PlusIcon />}
              className={buttonStyle}
              type="plain"
              onClick={() => zoomIn()}
            />
          </Tooltip>
          <div className={groupStyle}></div>
          <Tooltip content={'Download'} disablePortal={false}>
            <IconButton
              data-testid="download-button"
              icon={<DownloadIcon />}
              type="plain"
              className={buttonStyle}
              onClick={() => {
                assertExists(blockId);
                downloadHandler(blockId).catch(err => {
                  console.error('Could not download image', err);
                });
              }}
            />
          </Tooltip>
          <Tooltip content={'Copy to clipboard'} disablePortal={false}>
            <IconButton
              data-testid="copy-to-clipboard-button"
              icon={<CopyIcon />}
              type="plain"
              className={buttonStyle}
              onClick={() => {
                if (!imageRef.current) {
                  return;
                }
                const canvas = document.createElement('canvas');
                canvas.width = imageRef.current.naturalWidth;
                canvas.height = imageRef.current.naturalHeight;
                const context = canvas.getContext('2d');
                if (!context) {
                  console.warn('Could not get canvas context');
                  return;
                }
                context.drawImage(imageRef.current, 0, 0);
                canvas.toBlob(blob => {
                  if (!blob) {
                    console.warn('Could not get blob');
                    return;
                  }
                  const dataUrl = URL.createObjectURL(blob);
                  navigator.clipboard
                    .write([new ClipboardItem({ 'image/png': blob })])
                    .then(() => {
                      console.log('Image copied to clipboard');
                      URL.revokeObjectURL(dataUrl);
                    })
                    .catch(error => {
                      console.error('Error copying image to clipboard', error);
                      URL.revokeObjectURL(dataUrl);
                    });
                }, 'image/png');
                toast('Copied to clipboard.');
              }}
            />
          </Tooltip>
          <div className={groupStyle}></div>
          <Tooltip content={'Delete'} disablePortal={false}>
            <IconButton
              data-testid="delete-button"
              icon={<DeleteIcon />}
              type="plain"
              className={buttonStyle}
              onClick={() => blockId && deleteHandler(blockId)}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

const ErrorLogger = (props: FallbackProps) => {
  useEffect(() => {
    console.error('image preview modal error', props.error);
  }, [props.error]);
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
  const [blockId, setBlockId] = useAtom(previewBlockIdAtom);
  const [isOpen, setIsOpen] = useAtom(hasAnimationPlayedAtom);

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (isOpen) {
          setIsOpen(false);
        }
        return;
      }

      if (!blockId) {
        return;
      }

      const workspace = props.workspace;

      const page = workspace.getPage(props.pageId);
      assertExists(page);
      const block = page.getBlockById(blockId);
      assertExists(block);

      if (event.key === 'ArrowLeft') {
        const prevBlock = page
          .getPreviousSiblings(block)
          .findLast(
            (block): block is ImageBlockModel =>
              block.flavour === 'affine:image'
          );
        if (prevBlock) {
          setBlockId(prevBlock.id);
        }
      } else if (event.key === 'ArrowRight') {
        const nextBlock = page
          .getNextSiblings(block)
          .find(
            (block): block is ImageBlockModel =>
              block.flavour === 'affine:image'
          );
        if (nextBlock) {
          setBlockId(nextBlock.id);
        }
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [blockId, setBlockId, props.workspace, props.pageId, isOpen, setIsOpen]
  );

  useEffect(() => {
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyUp]);

  if (!blockId) {
    return null;
  }

  return (
    <ImagePreviewErrorBoundary>
      <div
        data-testid="image-preview-modal"
        className={`${imagePreviewBackgroundStyle} ${
          isOpen ? loaded : unloaded
        }`}
      >
        <Suspense>
          <ImagePreviewModalImpl
            {...props}
            blockId={blockId}
            onClose={() => setBlockId(null)}
          />
        </Suspense>
        <button
          data-testid="image-preview-close-button"
          onClick={() => {
            setBlockId(null);
          }}
          className={imagePreviewModalCloseButtonStyle}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M0.286086 0.285964C0.530163 0.0418858 0.925891 0.0418858 1.16997 0.285964L5.00013 4.11613L8.83029 0.285964C9.07437 0.0418858 9.4701 0.0418858 9.71418 0.285964C9.95825 0.530041 9.95825 0.925769 9.71418 1.16985L5.88401 5.00001L9.71418 8.83017C9.95825 9.07425 9.95825 9.46998 9.71418 9.71405C9.4701 9.95813 9.07437 9.95813 8.83029 9.71405L5.00013 5.88389L1.16997 9.71405C0.925891 9.95813 0.530163 9.95813 0.286086 9.71405C0.0420079 9.46998 0.0420079 9.07425 0.286086 8.83017L4.11625 5.00001L0.286086 1.16985C0.0420079 0.925769 0.0420079 0.530041 0.286086 0.285964Z"
              fill="#77757D"
            />
          </svg>
        </button>
      </div>
    </ImagePreviewErrorBoundary>
  );
};
