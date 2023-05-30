import './page-detail-editor.css';

import { PageNotFoundError, Unreachable } from '@affine/env/constant';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspacePage } from '@toeverything/hooks/use-block-suite-workspace-page';
import { useBlockSuiteWorkspacePageTitle } from '@toeverything/hooks/use-block-suite-workspace-page-title';
import { affinePluginsAtom } from '@toeverything/plugin-infra/manager';
import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';
import type { ExpectedLayout } from '@toeverything/plugin-infra/type';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import Head from 'next/head';
import type { FC } from 'react';
import React, {
  lazy,
  memo,
  startTransition,
  Suspense,
  useCallback,
  useMemo,
} from 'react';
import type { MosaicNode } from 'react-mosaic-component';

import { currentEditorAtom, workspacePreferredModeAtom } from '../atoms';
import { contentLayoutAtom } from '../atoms/layout';
import type { AffineOfficialWorkspace } from '../shared';
import { BlockSuiteEditor as Editor } from './blocksuite/block-suite-editor';

const Mosaic = lazy(() =>
  import('react-mosaic-component').then(({ Mosaic }) => ({
    default: Mosaic,
  }))
);

export type PageDetailEditorProps = {
  isPublic?: boolean;
  workspace: AffineOfficialWorkspace;
  pageId: string;
  onInit: (page: Page, editor: Readonly<EditorContainer>) => void;
  onLoad?: (page: Page, editor: EditorContainer) => () => void;
};

const EditorWrapper = memo(function EditorWrapper({
  workspace,
  pageId,
  onInit,
  onLoad,
  isPublic,
}: PageDetailEditorProps) {
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const page = useBlockSuiteWorkspacePage(blockSuiteWorkspace, pageId);
  if (!page) {
    throw new PageNotFoundError(blockSuiteWorkspace, pageId);
  }
  const meta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  const currentMode =
    useAtomValue(workspacePreferredModeAtom)[pageId] ?? 'page';
  const setEditor = useSetAtom(currentEditorAtom);
  assertExists(meta);
  return (
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
  );
});

const PluginContentAdapter = memo<{
  detailContent: PluginUIAdapter['detailContent'];
}>(function PluginContentAdapter({ detailContent }) {
  return (
    <div>
      {detailContent({
        contentLayoutAtom,
      })}
    </div>
  );
});

export const PageDetailEditor: FC<PageDetailEditorProps> = props => {
  const { workspace, pageId } = props;
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const page = useBlockSuiteWorkspacePage(blockSuiteWorkspace, pageId);
  if (!page) {
    throw new PageNotFoundError(blockSuiteWorkspace, pageId);
  }
  const title = useBlockSuiteWorkspacePageTitle(blockSuiteWorkspace, pageId);
  const affinePluginsMap = useAtomValue(affinePluginsAtom);
  const plugins = useMemo(
    () => Object.values(affinePluginsMap),
    [affinePluginsMap]
  );

  const [layout, setLayout] = useAtom(contentLayoutAtom);

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <Mosaic
        onChange={useCallback(
          (_: MosaicNode<string | number> | null) => {
            // type cast
            const node = _ as MosaicNode<string> | null;
            if (node) {
              if (typeof node === 'string') {
                console.error('unexpected layout');
              } else {
                if (node.splitPercentage && node.splitPercentage < 70) {
                  return;
                } else if (node.first !== 'editor') {
                  return;
                }
                setLayout(node as ExpectedLayout);
              }
            }
          },
          [setLayout]
        )}
        renderTile={id => {
          if (id === 'editor') {
            return <EditorWrapper {...props} />;
          } else {
            const plugin = plugins.find(plugin => plugin.definition.id === id);
            if (plugin && plugin.uiAdapter.detailContent) {
              return (
                <Suspense>
                  <PluginContentAdapter
                    detailContent={plugin.uiAdapter.detailContent}
                  />
                </Suspense>
              );
            }
          }
          throw new Unreachable();
        }}
        value={layout}
      />
    </>
  );
};
