import type { EditorContainer } from '@blocksuite/editor';
import { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { createWebsocketDocProvider, Store } from '@blocksuite/store';
import { BlockSchema, createEditor } from '@blocksuite/editor';
import '@blocksuite/blocks';

const getEditorParams = () => {
  const providers = [];
  const params = new URLSearchParams(location.search);
  if (params.get('syncModes') === 'websocket') {
    const WebsocketDocProvider = createWebsocketDocProvider(
      'ws://127.0.0.1:3000/collaboration/AFFiNE'
    );
    providers.push(WebsocketDocProvider);
  }

  return {
    providers,
  };
};

export const InitialEditor = ({
  setEditor,
}: {
  setEditor: (editor: EditorContainer) => void;
}) => {
  useEffect(() => {
    const store = new Store({
      // ...getEditorParams(),
    });
    const space = store.createSpace('page0').register(BlockSchema);
    const editor = createEditor(space);
    setEditor(editor);
  }, [setEditor]);
  return <div>111</div>;
};

export default InitialEditor;
