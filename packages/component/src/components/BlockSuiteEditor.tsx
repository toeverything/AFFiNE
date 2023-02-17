import { Editor, EditorProps } from '@blocksuite/react/editor';
import React from 'react';
export type BlockSuiteEditorProps = EditorProps;
export const BlockSuiteEditor = (props: BlockSuiteEditorProps) => {
  return <Editor {...props} />;
};
