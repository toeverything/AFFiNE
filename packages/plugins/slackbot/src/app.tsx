import { currentPageIdAtom } from '@affine/sdk/entry';
import {} from '@blocksuite/blocks';
import type { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import { useAtomValue } from 'jotai';
import type React from 'react';
import { useEffect, useState } from 'react';

import { getSelectedTextContent, sendToSlack, toast } from './utils';

type AppProps = {
  unload: () => void;
};

export const App: React.FC<AppProps> = props => {
  const { unload } = props;
  const currentPageId = useAtomValue(currentPageIdAtom);
  assertExists(currentPageId);
  const [editor, setEditor] = useState<EditorContainer>();
  const [selectedText, setSelectedText] = useState<string[]>([]);

  useEffect(() => {
    if (!editor || !editor.isConnected) {
      const editorContainer = document.querySelector(
        'editor-container'
      ) as EditorContainer;

      if (editorContainer) {
        setEditor(
          document.querySelector('editor-container') as EditorContainer
        );
      } else {
        unload();
      }
    }
  }, [editor, setEditor, unload]);

  useEffect(() => {
    if (editor && editor.root.value) {
      const root = editor.root.value;
      const watcher = root.selection.slots.changed.on(() => {
        setSelectedText(getSelectedTextContent(root));
      });

      return () => {
        watcher.dispose();
      };
    }

    return () => {};
  }, [setSelectedText, editor]);

  const disabled = selectedText.length === 0;

  return (
    <div
      style={{
        padding: 20,
        borderLeft: '1px solid var(--affine-border-color)',
        height: '100%',
      }}
    >
      <h1>Slackbot Plugin</h1>
      <div>
        <strong>{selectedText.length}</strong> blocks selected
      </div>
      <div
        style={{
          marginTop: 20,
          textAlign: 'center',
        }}
      >
        <button
          style={{
            ...(disabled
              ? {
                  backgroundColor: 'var(--affine-button-gray-color)',
                  color: 'var(--affine-text-disable-color)',
                }
              : {
                  backgroundColor: 'var(--affine-primary-color)',
                  color: 'var(--affine-pure-white)',
                }),
            padding: '10px 20px',
            borderRadius: 4,
          }}
          type="button"
          disabled={disabled}
          onClick={() =>
            sendToSlack(selectedText)
              .then(() => {
                toast('Block content has been sent to Slack!');
              })
              .catch(e => {
                toast('Failed to send block content to Slack!');
                console.error(e);
              })
          }
        >
          Send to Slack
        </button>
      </div>
    </div>
  );
};
