import {
  deleteLayoutAtom,
  pushLayoutAtom,
} from '@affine/sdk/entry';
import { ShareIcon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import { useSetAtom } from 'jotai';
import type { ComponentType, PropsWithChildren } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { useEditor } from './hooks';
import { headerStyle, shareSelectionBarStyle, sharingBarButtonStyle, textareaStyle } from './index.css';
import { getSelectionString } from './utils';

const generateShareLink = (sel: string) => {
  const url = new URL(window.location.href);
  // remove hash and search param of url
  url.hash = '';
  url.search = '';
  // append selection string to url
  url.searchParams.append('sel', sel);
  return url.toString();
}

const ShareSelectionBar = () => {
  const [shareLink, setShareLink] = useState<string>('');
  const [editor] = useEditor();

  const updateShareLink = () => {
    if (editor && editor.root.value) {
      const selectionString = getSelectionString(editor.root.value);
      setShareLink(selectionString ? generateShareLink(selectionString) : '');
    }
  };

  useEffect(updateShareLink, [editor]);

  const onCopyClick = async () => {
    await navigator.clipboard.writeText(shareLink);
  };

  return (
    <div
      className={shareSelectionBarStyle}
    >
      <h1
        className={headerStyle}
      >
        Share Selection
      </h1>
      <textarea
        className={textareaStyle} 
        value={shareLink} 
        readOnly
      ></textarea>
      <Tooltip
        content="Update share link"
      >
        <button
          className={sharingBarButtonStyle}
          onClick={updateShareLink}
        >
          Update
        </button>
      </Tooltip>
      <Tooltip
        content="Copy to clipboard"
      >
        <button
          className={sharingBarButtonStyle}
          onClick={onCopyClick}
        >
          Copy
        </button>
      </Tooltip>
    </div>
  );
};

export const HeaderItem = ({
  Provider,
}: {
  Provider: ComponentType<PropsWithChildren>;
}) => {
  const [open, setOpen] = useState(false);
  const pushLayout = useSetAtom(pushLayoutAtom);
  const deleteLayout = useSetAtom(deleteLayoutAtom);
  const [container, setContainer] = useState<HTMLButtonElement | null>(null);

  return (
    <Tooltip
      content={`${open ? 'Collapse' : 'Expand'} Selection Sidebar`}
      portalOptions={{
        container,
      }}
    >
      <IconButton
        size="large"
        ref={setContainer}
        style={{
          width: '32px',
          fontSize: '24px',
        }}
        onClick={useCallback(() => {
          if (!open) {
            setOpen(true);
            pushLayout(
              '@affine/share-selection-plugin',
              div => {
                const root = createRoot(div);

                div.style.height = '100%';

                root.render(
                  <Provider>
                    <ShareSelectionBar />
                  </Provider>
                );
                return () => {
                  root.unmount();
                };
              },
              {
                maxWidth: [undefined, 300],
              }
            );
          } else {
            setOpen(false);
            deleteLayout('@affine/share-selection-plugin');
          }
        }, [Provider, deleteLayout, open, pushLayout])}
      >
        <ShareIcon />
      </IconButton>
    </Tooltip>
  );
};
