import { PageNotFoundError } from '@affine/env/constant';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspacePage } from '@toeverything/hooks/use-block-suite-workspace-page';
import { useBlockSuiteWorkspacePageTitle } from '@toeverything/hooks/use-block-suite-workspace-page-title';
import { affinePluginsAtom } from '@toeverything/plugin-infra/manager';
import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';
import { useAtomValue, useSetAtom } from 'jotai';
import Head from 'next/head';
import type React from 'react';
import { startTransition, useCallback, useMemo, useRef } from 'react';

import { currentEditorAtom, workspacePreferredModeAtom } from '../../atoms';
import type { AffineOfficialWorkspace } from '../../shared';
import { BlockSuiteEditor as Editor } from '../blocksuite/block-suite-editor';
import { WorkspaceHeader } from '../blocksuite/workspace-header';
import { contentStyle } from './index.css';

export type PageDetailEditorProps = {
  isPublic?: boolean;
  isPreview?: boolean;
  workspace: AffineOfficialWorkspace;
  pageId: string;
  onInit: (page: Page, editor: Readonly<EditorContainer>) => void;
  onLoad?: (page: Page, editor: EditorContainer) => () => void;
  header?: React.ReactNode;
};

export const PageDetailContent: React.FC<PageDetailEditorProps> = ({
  workspace,
  pageId,
  onInit,
  onLoad,
  header,
  isPublic,
  isPreview,
}) => {
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const page = useBlockSuiteWorkspacePage(blockSuiteWorkspace, pageId);
  if (!page) {
    throw new PageNotFoundError(blockSuiteWorkspace, pageId);
  }
  const title = useBlockSuiteWorkspacePageTitle(blockSuiteWorkspace, pageId);
  const meta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  const currentMode =
    useAtomValue(workspacePreferredModeAtom)[pageId] ?? 'page';
  const setEditor = useSetAtom(currentEditorAtom);
  assertExists(meta);

  const affinePluginsMap = useAtomValue(affinePluginsAtom);
  const plugins = useMemo(
    () => Object.values(affinePluginsMap),
    [affinePluginsMap]
  );
  const divRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <WorkspaceHeader
        isPublic={isPublic ?? false}
        isPreview={isPreview ?? false}
        workspace={workspace}
        currentPage={page}
      >
        {header}
      </WorkspaceHeader>
      <div className={contentStyle} ref={divRef}>
        <Editor
          style={{
            height: 'calc(100% - 52px)',
          }}
          key={`${workspace.flavour}-${workspace.id}-${pageId}`}
          mode={isPublic ? 'page' : currentMode}
          page={page}
          onInit={useCallback(
            (page: Page, editor: Readonly<EditorContainer>) => {
              startTransition(() => {
                setEditor(editor);
              });
              onInit(page, editor);
            },
            [onInit, setEditor]
          )}
          onLoad={useCallback(
            (page: Page, editor: EditorContainer) => {
              startTransition(() => {
                setEditor(editor);
              });
              page.workspace.setPageMeta(page.id, {
                updatedDate: Date.now(),
              });
              localStorage.setItem('last_page_id', page.id);
              if (onLoad) {
                return onLoad(page, editor);
              }
              return () => {};
            },
            [onLoad, setEditor]
          )}
        />
        {divRef.current &&
          plugins
            .filter(plugin => plugin.uiAdapter.headerItem != null)
            .map(plugin => {
              const detailContent = plugin.uiAdapter
                .detailContent as PluginUIAdapter['detailContent'];
              const item = detailContent(divRef.current as HTMLDivElement, {});
              item.key = plugin.definition.id;
              return item;
            })}
      </div>
    </>
  );
};
