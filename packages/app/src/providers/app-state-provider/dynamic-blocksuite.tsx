import { useEffect } from 'react';
import type { Page } from '@blocksuite/store';
import '@blocksuite/blocks';
import { EditorContainer } from '@blocksuite/editor';
import type { LoadWorkspaceHandler, CreateEditorHandler } from './context';
import { getDataCenter } from '@affine/datacenter';

interface Props {
  setLoadWorkspaceHandler: (handler: LoadWorkspaceHandler) => void;
  setCreateEditorHandler: (handler: CreateEditorHandler) => void;
}

const DynamicBlocksuite = ({
  setLoadWorkspaceHandler,
  setCreateEditorHandler,
}: Props) => {
  useEffect(() => {
    const openWorkspace: LoadWorkspaceHandler = (workspaceId: string, user) =>
      // eslint-disable-next-line no-async-promise-executor
      new Promise(async resolve => {
        if (workspaceId) {
          const workspace = await getDataCenter().then(dc =>
            dc.getWorkspace(workspaceId, 'affine')
          );

          resolve(workspace);
        } else {
          resolve(null);
        }
      });

    setLoadWorkspaceHandler(openWorkspace);
  }, [setLoadWorkspaceHandler]);

  useEffect(() => {
    const createEditorHandler: CreateEditorHandler = (page: Page) => {
      const editor = new EditorContainer();
      editor.page = page;
      return editor;
    };

    setCreateEditorHandler(createEditorHandler);
  }, [setCreateEditorHandler]);

  return <></>;
};

export default DynamicBlocksuite;
