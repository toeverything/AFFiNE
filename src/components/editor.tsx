import type { EditorContainer } from '@blocksuite/editor';
import '@blocksuite/blocks';
import '@blocksuite/editor';
import '@blocksuite/blocks/style';

declare global {
  interface Window {
    editor: EditorContainer;
  }
}

export const Editor = () => {
  return <editor-container />;
};

declare global {
  interface HTMLElementTagNameMap {
    'editor-container': EditorContainer;
  }

  namespace JSX {
    interface IntrinsicElements {
      // TODO fix type error
      'editor-container': any; // EditorContainer
    }
  }
}

export default Editor;
