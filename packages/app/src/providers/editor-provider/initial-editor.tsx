import '@blocksuite/blocks';
import '@blocksuite/blocks/style';
import type { EditorContainer } from '@blocksuite/editor';
import { BlockSchema, createEditor } from '@blocksuite/editor';
import { useEffect } from 'react';
import pkg from '../../../package.json';
import { createWebsocketDocProvider, Store } from '@blocksuite/store';

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

const InitialEditor = ({
  setEditor,
}: {
  setEditor: (editor: EditorContainer) => void;
}) => {
  useEffect(() => {
    const store = new Store({
      ...getEditorParams(),
    });
    const space = store.createSpace('page0').register(BlockSchema);
    const editor = createEditor(space);

    setEditor(editor);

    return () => {
      editor.remove();
    };
  }, [setEditor]);

  useEffect(() => {
    const version = pkg.dependencies['@blocksuite/editor'].substring(1);
    console.log(`BlockSuite live demo ${version}`);
  }, []);

  return <div />;
};

export default InitialEditor;
