/// <reference types="react/experimental" />
import '@blocksuite/blocks';

import type { EmbedBlockModel } from '@blocksuite/blocks';
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
import clsx from 'clsx';
import { useAtom } from 'jotai';
import type { ReactElement } from 'react';
import { Suspense, useCallback } from 'react';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import Button from '../../ui/button/button';
import { useZoomControls } from './hooks/use-zoom';
import {
  buttonStyle,
  captionStyle,
  groupStyle,
  imageBottomContainerStyle,
  imageNavigationControlStyle,
  imagePreviewActionBarStyle,
  imagePreviewModalCaptionStyle,
  imagePreviewModalCenterStyle,
  imagePreviewModalCloseButtonStyle,
  imagePreviewModalContainerStyle,
  imagePreviewModalGoStyle,
  imagePreviewModalStyle,
  scaleIndicatorStyle,
} from './index.css';
import { previewBlockIdAtom } from './index.jotai';

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

  const [bIsActionBarVisible, setBIsActionBarVisible] = useState(false);
  const [caption, setCaption] = useState(() => {
    const page = props.workspace.getPage(props.pageId);
    assertExists(page);
    const block = page.getBlockById(props.blockId) as EmbedBlockModel;
    assertExists(block);
    return block?.caption;
  });
  useEffect(() => {
    const page = props.workspace.getPage(props.pageId);
    assertExists(page);
    const block = page.getBlockById(props.blockId) as EmbedBlockModel;
    assertExists(block);
    setCaption(block?.caption);
  }, [props.blockId, props.pageId, props.workspace]);
  const { data } = useSWR(['workspace', 'embed', props.pageId, props.blockId], {
    fetcher: ([_, __, pageId, blockId]) => {
      const page = props.workspace.getPage(pageId);
      assertExists(page);
      const block = page.getBlockById(blockId) as EmbedBlockModel;
      assertExists(block);
      return props.workspace.blobs.get(block?.sourceId);
    },
    suspense: true,
  });
  const zoomRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const {
    zoomIn,
    zoomOut,
    isZoomedBigger,
    handleDrag,
    handleDragStart,
    handleDragEnd,
    resetZoom,
    currentScale,
  } = useZoomControls({ zoomRef, imageRef });
  const [prevData, setPrevData] = useState<string | null>(() => data);
  const [url, setUrl] = useState<string | null>(null);
  if (prevData !== data) {
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
  const nextImageHandler = (blockId: string | null) => {
    assertExists(blockId);
    const workspace = props.workspace;

    const page = workspace.getPage(props.pageId);
    assertExists(page);
    const block = page.getBlockById(blockId);
    assertExists(block);
    const nextBlock = page
      .getNextSiblings(block)
      .find(
        (block): block is EmbedBlockModel => block.flavour === 'affine:embed'
      );
    if (nextBlock) {
      setBlockId(nextBlock.id);
      const image = imageRef.current;
      resetZoom();
      if (image) {
        image.style.width = '50%'; // Reset the width to its original size
        image.style.height = 'auto'; // Reset the height to maintain aspect ratio
      }
    }
  };

  const previousImageHandler = (blockId: string | null) => {
    assertExists(blockId);
    const workspace = props.workspace;
    const page = workspace.getPage(props.pageId);
    assertExists(page);
    const block = page.getBlockById(blockId);
    assertExists(block);
    const prevBlock = page
      .getPreviousSiblings(block)
      .findLast(
        (block): block is EmbedBlockModel => block.flavour === 'affine:embed'
      );
    if (prevBlock) {
      setBlockId(prevBlock.id);
      const image = imageRef.current;
      if (image) {
        resetZoom();
        image.style.width = '50%'; // Reset the width to its original size
        image.style.height = 'auto'; // Reset the height to maintain aspect ratio
      }
    }
  };

  const deleteHandler = (blockId: string) => {
    const workspace = props.workspace;

    const page = workspace.getPage(props.pageId);
    assertExists(page);
    const block = page.getBlockById(blockId);
    assertExists(block);
    if (
      page
        .getPreviousSiblings(block)
        .findLast(
          (block): block is EmbedBlockModel => block.flavour === 'affine:embed'
        )
    ) {
      const prevBlock = page
        .getPreviousSiblings(block)
        .findLast(
          (block): block is EmbedBlockModel => block.flavour === 'affine:embed'
        );
      if (prevBlock) {
        setBlockId(prevBlock.id);
        const image = imageRef.current;
        resetZoom();
        if (image) {
          image.style.width = '100%'; // Reset the width to its original size
          image.style.height = 'auto'; // Reset the height to maintain aspect ratio
        }
      }
    } else if (
      page
        .getNextSiblings(block)
        .find(
          (block): block is EmbedBlockModel => block.flavour === 'affine:embed'
        )
    ) {
      const nextBlock = page
        .getNextSiblings(block)
        .find(
          (block): block is EmbedBlockModel => block.flavour === 'affine:embed'
        );
      if (nextBlock) {
        const image = imageRef.current;
        resetZoom();
        if (image) {
          image.style.width = '100%'; // Reset the width to its original size
          image.style.height = 'auto'; // Reset the height to maintain aspect ratio
        }
        setBlockId(nextBlock.id);
      }
    } else {
      props.onClose();
    }
    page.deleteBlock(block);
  };

  let actionbarTimeout: NodeJS.Timeout;

  const downloadHandler = async (blockId: string | null) => {
    const workspace = props.workspace;
    const page = workspace.getPage(props.pageId);
    assertExists(page);
    if (typeof blockId === 'string') {
      const block = page.getBlockById(blockId) as EmbedBlockModel;
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
      const event = new MouseEvent('click');
      a.download = block.id;
      a.href = downloadUrl;
      a.dispatchEvent(event);

      // cleanup
      a.remove();
      URL.revokeObjectURL(downloadUrl);
    }
  };

  const handleMouseEnter = () => {
    clearTimeout(actionbarTimeout);
    setBIsActionBarVisible(true);
  };

  const handleMouseLeave = () => {
    actionbarTimeout = setTimeout(() => {
      setBIsActionBarVisible(false);
    }, 3000);
  };

  return (
    <div data-testid="image-preview-modal" className={imagePreviewModalStyle}>
      <div className={imageNavigationControlStyle}>
        <span
          className={imagePreviewModalGoStyle}
          style={{
            left: 0,
          }}
          onClick={() => {
            assertExists(blockId);
            previousImageHandler(blockId);
          }}
        >
          ❮
        </span>
        <span
          className={imagePreviewModalGoStyle}
          style={{
            right: 0,
          }}
          onClick={() => {
            assertExists(blockId);
            nextImageHandler(blockId);
          }}
        >
          ❯
        </span>
      </div>
      <div className={imagePreviewModalContainerStyle}>
        <div
          className={clsx('zoom-area', { 'zoomed-bigger': isZoomedBigger })}
          ref={zoomRef}
        >
          <div className={imagePreviewModalCenterStyle}>
            <img
              data-blob-id={props.blockId}
              src={url}
              alt={caption}
              ref={imageRef}
              draggable={isZoomedBigger}
              onMouseDown={handleDragStart}
              onMouseMove={handleDrag}
              onMouseUp={handleDragEnd}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              width={'50%'}
            />
            {isZoomedBigger ? null : (
              <p className={imagePreviewModalCaptionStyle}>{caption}</p>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={() => {
          props.onClose();
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
      {bIsActionBarVisible ? (
        <div
          className={imageBottomContainerStyle}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isZoomedBigger && caption !== '' ? (
            <p className={captionStyle}>{caption}</p>
          ) : null}
          <div className={imagePreviewActionBarStyle}>
            <div>
              <Button
                icon={<ArrowLeftSmallIcon />}
                noBorder={true}
                className={buttonStyle}
                onClick={() => {
                  assertExists(blockId);
                  previousImageHandler(blockId);
                }}
              />
              <Button
                icon={<ArrowRightSmallIcon />}
                noBorder={true}
                className={buttonStyle}
                onClick={() => {
                  assertExists(blockId);
                  nextImageHandler(blockId);
                }}
              />
            </div>
            <div className={groupStyle}>
              <Button
                icon={<ViewBarIcon />}
                noBorder={true}
                className={buttonStyle}
                onClick={() => resetZoom()}
              />
              <Button
                icon={<MinusIcon />}
                noBorder={true}
                className={buttonStyle}
                onClick={zoomOut}
              />
              <span className={scaleIndicatorStyle}>{`${(
                currentScale * 100
              ).toFixed(0)}%`}</span>
              <Button
                icon={<PlusIcon />}
                noBorder={true}
                className={buttonStyle}
                onClick={() => zoomIn()}
              />
            </div>
            <div className={groupStyle}>
              <Button
                icon={<DownloadIcon />}
                noBorder={true}
                className={buttonStyle}
                onClick={() => {
                  assertExists(blockId);
                  downloadHandler(blockId).catch(err => {
                    console.error('Could not download image', err);
                  });
                }}
              />
              <Button
                icon={<CopyIcon />}
                noBorder={true}
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
                        console.error(
                          'Error copying image to clipboard',
                          error
                        );
                        URL.revokeObjectURL(dataUrl);
                      });
                  }, 'image/png');
                }}
              />
            </div>
            <div className={groupStyle}>
              <Button
                icon={<DeleteIcon />}
                noBorder={true}
                className={buttonStyle}
                onClick={() => blockId && deleteHandler(blockId)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const ImagePreviewModal = (
  props: ImagePreviewModalProps
): ReactElement | null => {
  const [blockId, setBlockId] = useAtom(previewBlockIdAtom);

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setBlockId(null);
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
            (block): block is EmbedBlockModel =>
              block.flavour === 'affine:embed'
          );
        if (prevBlock) {
          setBlockId(prevBlock.id);
        }
      } else if (event.key === 'ArrowRight') {
        const nextBlock = page
          .getNextSiblings(block)
          .find(
            (block): block is EmbedBlockModel =>
              block.flavour === 'affine:embed'
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
    [blockId, setBlockId, props.workspace, props.pageId]
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
    <Suspense fallback={<div className={imagePreviewModalStyle} />}>
      <ImagePreviewModalImpl
        {...props}
        blockId={blockId}
        onClose={() => setBlockId(null)}
      />
    </Suspense>
  );
};
