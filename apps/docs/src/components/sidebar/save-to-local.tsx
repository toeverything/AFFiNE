'use client';
import { assertExists } from '@blocksuite/global/utils';
import { useAtomValue } from 'jotai/react';
import { useCallback } from 'react';
import { encodeStateAsUpdate } from 'yjs';

import { workspaceAtom } from '../../atom.js';

type SaveToLocalProps = {
  saveFile: (update: number[]) => void;
};

export const SaveToLocal = (props: SaveToLocalProps) => {
  const workspace = useAtomValue(workspaceAtom);
  const saveFile = props.saveFile;
  const onSave = useCallback(() => {
    const page = workspace.getPage('page0');
    assertExists(page);
    saveFile([...encodeStateAsUpdate(page.spaceDoc)]);
  }, [saveFile, workspace]);
  return (
    <div>
      <div className="flex items-center justify-center h-16 font-bold">
        <button onClick={onSave}>Save to Local</button>
      </div>
    </div>
  );
};
