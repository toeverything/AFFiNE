import './page-detail-editor.css';

import { PageNotFoundError } from '@affine/env/constant';
import type { LayoutNode } from '@affine/sdk//entry';
import { rootBlockHubAtom } from '@affine/workspace/atom';
import type { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { Page, Workspace } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspacePage } from '@toeverything/hooks/use-block-suite-workspace-page';
import {
  addCleanup,
  pluginEditorAtom,
  pluginWindowAtom,
} from '@toeverything/infra/__internal__/plugin';
import { contentLayoutAtom, rootStore } from '@toeverything/infra/atom';
import clsx from 'clsx';
import { useAtomValue, useSetAtom } from 'jotai';
import type { CSSProperties, ReactElement } from 'react';
import { memo, Suspense, useCallback, useMemo } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { pageSettingFamily } from '../atoms';
import { fontStyleOptions, useAppSetting } from '../atoms/settings';
import { BlockSuiteEditor as Editor } from './blocksuite/block-suite-editor';
import * as styles from './page-detail-editor.css';
import { pluginContainer } from './page-detail-editor.css';
import { TrashButtonGroup } from './pure/trash-button-group';

export interface PageDetailEditorProps {
  isPublic?: boolean;
  workspace: Workspace;
  pageId: string;
  onInit: (page: Page, editor: Readonly<EditorContainer>) => void;
  onLoad?: (page: Page, editor: EditorContainer) => () => void;
}

const EditorWrapper = memo(function EditorWrapper({
  workspace,
  pageId,
  onInit,
  onLoad,
  isPublic,
}: PageDetailEditorProps) {
  const page = useBlockSuiteWorkspacePage(workspace, pageId);
  if (!page) {
    throw new PageNotFoundError(workspace, pageId);
  }
  const meta = useBlockSuitePageMeta(workspace).find(
    meta => meta.id === pageId
  );
  const pageSettingAtom = pageSettingFamily(pageId);
  const pageSetting = useAtomValue(pageSettingAtom);
  const currentMode = pageSetting?.mode ?? 'page';

  const setBlockHub = useSetAtom(rootBlockHubAtom);
  const [appSettings] = useAppSetting();

  assertExists(meta);
  const value = useMemo(() => {
    const fontStyle = fontStyleOptions.find(
      option => option.key === appSettings.fontStyle
    );
    assertExists(fontStyle);
    return fontStyle.value;
  }, [appSettings.fontStyle]);

  return (
    <>
      <Editor
        className={clsx(styles.editor, {
          'full-screen': appSettings.fullWidthLayout,
        })}
        style={
          {
            '--affine-font-family': value,
          } as CSSProperties
        }
        mode={isPublic ? 'page' : currentMode}
        page={page}
        onInit={useCallback(
          (page: Page, editor: Readonly<EditorContainer>) => {
            onInit(page, editor);
          },
          [onInit]
        )}
        setBlockHub={setBlockHub}
        onLoad={useCallback(
          (page: Page, editor: EditorContainer) => {
            page.workspace.setPageMeta(page.id, {
              updatedDate: Date.now(),
            });
            localStorage.setItem('last_page_id', page.id);
            let dispose = () => {};
            if (onLoad) {
              dispose = onLoad(page, editor);
            }
            const editorItems = rootStore.get(pluginEditorAtom);
            let disposes: (() => void)[] = [];
            const renderTimeout = setTimeout(() => {
              disposes = Object.entries(editorItems).map(([id, editorItem]) => {
                const div = document.createElement('div');
                div.setAttribute('plugin-id', id);
                const cleanup = editorItem(div, editor);
                assertExists(parent);
                document.body.appendChild(div);
                return () => {
                  cleanup();
                  document.body.removeChild(div);
                };
              });
            });

            return () => {
              dispose();
              clearTimeout(renderTimeout);
              setTimeout(() => {
                disposes.forEach(dispose => dispose());
              });
            };
          },
          [onLoad]
        )}
      />
      {meta.trash && <TrashButtonGroup />}
    </>
  );
});

interface PluginContentAdapterProps {
  windowItem: (div: HTMLDivElement) => () => void;
  pluginName: string;
}

const PluginContentAdapter = memo<PluginContentAdapterProps>(
  function PluginContentAdapter({ windowItem, pluginName }) {
    return (
      <div
        className={pluginContainer}
        ref={useCallback(
          (ref: HTMLDivElement | null) => {
            if (ref) {
              const div = document.createElement('div');
              const cleanup = windowItem(div);
              ref.appendChild(div);
              addCleanup(pluginName, () => {
                cleanup();
                ref.removeChild(div);
              });
            }
          },
          [pluginName, windowItem]
        )}
      />
    );
  }
);

interface LayoutPanelProps {
  node: LayoutNode;
  editorProps: PageDetailEditorProps;
}

const LayoutPanel = memo(function LayoutPanel(
  props: LayoutPanelProps
): ReactElement {
  const node = props.node;
  const windowItems = useAtomValue(pluginWindowAtom);
  if (typeof node === 'string') {
    if (node === 'editor') {
      return <EditorWrapper {...props.editorProps} />;
    } else {
      const windowItem = windowItems[node];
      return <PluginContentAdapter pluginName={node} windowItem={windowItem} />;
    }
  } else {
    return (
      <PanelGroup
        style={{
          height: 'calc(100% - 52px)',
        }}
        direction={node.direction}
      >
        <Panel defaultSize={node.splitPercentage}>
          <Suspense>
            <LayoutPanel node={node.first} editorProps={props.editorProps} />
          </Suspense>
        </Panel>
        <PanelResizeHandle />
        <Panel
          defaultSize={100 - node.splitPercentage}
          style={{
            overflow: 'scroll',
          }}
        >
          <Suspense>
            <LayoutPanel node={node.second} editorProps={props.editorProps} />
          </Suspense>
        </Panel>
      </PanelGroup>
    );
  }
});

export const PageDetailEditor = (props: PageDetailEditorProps) => {
  const { workspace, pageId } = props;
  const page = useBlockSuiteWorkspacePage(workspace, pageId);
  if (!page) {
    throw new PageNotFoundError(workspace, pageId);
  }

  const layout = useAtomValue(contentLayoutAtom);

  return (
    <>
      <Suspense>
        <LayoutPanel node={layout} editorProps={props} />
      </Suspense>
    </>
  );
};
