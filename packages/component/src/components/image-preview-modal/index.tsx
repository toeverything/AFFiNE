/// <reference types="react/experimental" />
import '@blocksuite/blocks';

import type {
  EmbedBlockDoubleClickData,
  EmbedBlockModel,
} from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import type { Workspace } from '@blocksuite/store';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import {
  imagePreviewModalCloseButtonStyle,
  imagePreviewModalImageStyle,
  imagePreviewModalStyle,
} from './index.css';

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
    <div className={imagePreviewModalStyle}>
      <button
        onClick={() => {
          props.onClose();
        }}
        className={imagePreviewModalCloseButtonStyle}
      >
        X
      </button>
      <img
        alt=""
        className={imagePreviewModalImageStyle}
        ref={imageRef}
        src={url}
      />
    </div>
  );
};

export const ImagePreviewModal = (
  props: ImagePreviewModalProps
): ReactElement | null => {
  const [blockId, setBlockId] = useState<string | null>(null);
  useEffect(() => {
    const callback = (event: CustomEvent<EmbedBlockDoubleClickData>) => {
      setBlockId(event.detail.blockId);
    };
    window.addEventListener('affine.embed-block-db-click', callback);
    return () => {
      window.removeEventListener('affine.embed-block-db-click', callback);
    };
  }, []);
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
