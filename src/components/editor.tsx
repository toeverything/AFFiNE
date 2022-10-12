import type { EditorContainer } from '@blocksuite/editor';
import '@blocksuite/blocks';
import '@blocksuite/editor';
import '@blocksuite/blocks/style';

export const Editor = () => {
  return (
    <div>
      Editor
      <editor-container />
    </div>
  );
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
