/// <reference types="react/experimental" />
import '@blocksuite/blocks';

import type { EmbedBlockModel } from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import type { Workspace } from '@blocksuite/store';
import { useAtom } from 'jotai';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import {
  imagePreviewModalCloseButtonStyle,
  imagePreviewModalContainerStyle,
  imagePreviewModalImageStyle,
  imagePreviewModalStyle,
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
  const [caption, setCaption] = useState(() => {
    const page = props.workspace.getPage(props.pageId);
    assertExists(page);
    const block = page.getBlockById(props.blockId) as EmbedBlockModel | null;
    assertExists(block);
    return block.caption;
  });
  useEffect(() => {
    const page = props.workspace.getPage(props.pageId);
    assertExists(page);
    const block = page.getBlockById(props.blockId) as EmbedBlockModel | null;
    assertExists(block);
    const disposable = block.propsUpdated.on(() => {
      setCaption(block.caption);
    });
    return () => {
      disposable.dispose();
    };
  }, [props.blockId, props.pageId, props.workspace]);
  const { data } = useSWR(['workspace', 'embed', props.pageId, props.blockId], {
    fetcher: ([_, __, pageId, blockId]) => {
      const page = props.workspace.getPage(pageId);
      assertExists(page);
      const block = page.getBlockById(blockId) as EmbedBlockModel | null;
      assertExists(block);
      return props.workspace.blobs.get(block.sourceId);
    },
    suspense: true,
  });
  const [prevData, setPrevData] = useState<string | null>(() => data);
  const [url, setUrl] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
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
  return (
    <div data-testid="image-preview-modal" className={imagePreviewModalStyle}>
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
      <div className={imagePreviewModalContainerStyle}>
        <img
          alt={caption}
          className={imagePreviewModalImageStyle}
          ref={imageRef}
          src={url}
        />
      </div>
    </div>
  );
};

export const ImagePreviewModal = (
  props: ImagePreviewModalProps
): ReactElement | null => {
  const [blockId, setBlockId] = useAtom(previewBlockIdAtom);
  if (!blockId) {
    return null;
  }

  return (
    <ImagePreviewModalImpl
      {...props}
      blockId={blockId}
      onClose={() => setBlockId(null)}
    />
  );
};
