import React from 'react';
import { useEditor } from '@/providers/editor-provider';
import JumpTo from './jumpTo';

const Result = () => {
  const { editor, mode, setMode } = useEditor();
  console.log(editor?.page);

  return (
    <div>
      <JumpTo />
    </div>
  );
};

export default Result;
