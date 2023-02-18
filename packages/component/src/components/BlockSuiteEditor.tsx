import { Editor, EditorProps } from '@blocksuite/react/editor';
export type BlockSuiteEditorProps = EditorProps;
export const BlockSuiteEditor = (props: BlockSuiteEditorProps) => {
  return <Editor {...props} />;
};
