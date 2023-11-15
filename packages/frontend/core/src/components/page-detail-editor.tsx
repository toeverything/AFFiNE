import './page-detail-editor.css';

import { PageNotFoundError } from '@affine/env/constant';
import type { LayoutNode } from '@affine/sdk/entry';
import { rootBlockHubAtom } from '@affine/workspace/atom';
import type { BlockHub } from '@blocksuite/blocks';
import type { EditorContainer } from '@blocksuite/editor';
import { assertExists, DisposableGroup } from '@blocksuite/global/utils';
import type { Page, Workspace } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspacePage } from '@toeverything/hooks/use-block-suite-workspace-page';
import {
  addCleanup,
  pluginEditorAtom,
  pluginWindowAtom,
} from '@toeverything/infra/__internal__/plugin';
import { contentLayoutAtom, getCurrentStore } from '@toeverything/infra/atom';
import clsx from 'clsx';
import { useAtomValue, useSetAtom } from 'jotai';
import type { CSSProperties, ReactElement } from 'react';
import {
  memo,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useLocation } from 'react-router-dom';

import { type PageMode, pageSettingFamily } from '../atoms';
import { fontStyleOptions } from '../atoms/settings';
import { useAppSettingHelper } from '../hooks/affine/use-app-setting-helper';
import { useBlockSuiteMetaHelper } from '../hooks/affine/use-block-suite-meta-helper';
import { BlockSuiteEditor as Editor } from './blocksuite/block-suite-editor';
import { Bookmark } from './bookmark';
import * as styles from './page-detail-editor.css';
import { editorContainer, pluginContainer } from './page-detail-editor.css';
import { TrashButtonGroup } from './pure/trash-button-group';

declare global {
  // eslint-disable-next-line no-var
  var currentEditor: EditorContainer | undefined;
}

export type OnLoadEditor = (page: Page, editor: EditorContainer) => () => void;

export interface PageDetailEditorProps {
  isPublic?: boolean;
  publishMode?: PageMode;
  workspace: Workspace;
  pageId: string;
  onLoad?: OnLoadEditor;
}

function useRouterHash() {
  return useLocation().hash.substring(1);
}

function useCreateAndSetRootBlockHub(
  editor?: EditorContainer,
  showBlockHub?: boolean
) {
  const setBlockHub = useSetAtom(rootBlockHubAtom);
  useEffect(() => {
    let canceled = false;
    let blockHub: BlockHub | undefined;
    if (editor && showBlockHub) {
      editor
        .createBlockHub()
        .then(bh => {
          if (canceled) {
            return;
          }
          blockHub = bh;
          setBlockHub(blockHub);
        })
        .catch(console.error);
    }
    return () => {
      canceled = true;
      blockHub?.remove();
    };
  }, [editor, showBlockHub, setBlockHub]);
}

const EditorWrapper = memo(function EditorWrapper({
  workspace,
  pageId,
  onLoad,
  isPublic,
  publishMode,
}: PageDetailEditorProps) {
  const page = useBlockSuiteWorkspacePage(workspace, pageId);
  if (!page) {
    throw new PageNotFoundError(workspace, pageId);
  }
  const meta = useBlockSuitePageMeta(workspace).find(
    meta => meta.id === pageId
  );

  const { switchToEdgelessMode, switchToPageMode } =
    useBlockSuiteMetaHelper(workspace);

  const pageSettingAtom = pageSettingFamily(pageId);
  const pageSetting = useAtomValue(pageSettingAtom);

  const mode = useMemo(() => {
    const currentMode = pageSetting.mode;
    const shareMode = publishMode || currentMode;

    if (isPublic) {
      return shareMode;
    }
    return currentMode;
  }, [isPublic, publishMode, pageSetting.mode]);

  const { appSettings } = useAppSettingHelper();

  assertExists(meta);
  const value = useMemo(() => {
    const fontStyle = fontStyleOptions.find(
      option => option.key === appSettings.fontStyle
    );
    assertExists(fontStyle);
    return fontStyle.value;
  }, [appSettings.fontStyle]);

  const setEditorMode = useCallback(
    (mode: 'page' | 'edgeless') => {
      if (isPublic) {
        return;
      }
      if (mode === 'edgeless') {
        switchToEdgelessMode(pageId);
      } else {
        switchToPageMode(pageId);
      }
    },
    [isPublic, switchToEdgelessMode, pageId, switchToPageMode]
  );

  const [editor, setEditor] = useState<EditorContainer>();
  const blockId = useRouterHash();

  useCreateAndSetRootBlockHub(editor, !meta.trash);

  const onLoadEditor = useCallback(
    (editor: EditorContainer) => {
      // debug current detail editor
      globalThis.currentEditor = editor;
      setEditor(editor);
      const disposableGroup = new DisposableGroup();
      disposableGroup.add(
        page.slots.blockUpdated.once(() => {
          page.workspace.setPageMeta(page.id, {
            updatedDate: Date.now(),
          });
        })
      );
      localStorage.setItem('last_page_id', page.id);
      if (onLoad) {
        disposableGroup.add(onLoad(page, editor));
      }
      const rootStore = getCurrentStore();
      const editorItems = rootStore.get(pluginEditorAtom);
      let disposes: (() => void)[] = [];
      const renderTimeout = window.setTimeout(() => {
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
        disposableGroup.dispose();
        clearTimeout(renderTimeout);
        window.setTimeout(() => {
          disposes.forEach(dispose => dispose());
        });
      };
    },
    [onLoad, page]
  );

  return (
    <>
      <Editor
        className={clsx(styles.editor, {
          'full-screen': appSettings.fullWidthLayout,
          'is-public-page': isPublic,
        })}
        style={
          {
            '--affine-font-family': value,
          } as CSSProperties
        }
        mode={mode}
        page={page}
        onModeChange={setEditorMode}
        defaultSelectedBlockId={blockId}
        onLoadEditor={onLoadEditor}
      />
      {meta.trash && <TrashButtonGroup />}
      <Bookmark page={page} />
    </>
  );
});

interface PluginContentAdapterProps {
  windowItem: (div: HTMLDivElement) => () => void;
  pluginName: string;
}

const PluginContentAdapter = memo<PluginContentAdapterProps>(
  function PluginContentAdapter({ windowItem, pluginName }) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      const abortController = new AbortController();
      const root = rootRef.current;
      if (root) {
        startTransition(() => {
          if (abortController.signal.aborted) {
            return;
          }
          const div = document.createElement('div');
          const cleanup = windowItem(div);
          root.appendChild(div);
          if (abortController.signal.aborted) {
            cleanup();
            root.removeChild(div);
          } else {
            const cl = () => {
              cleanup();
              root.removeChild(div);
            };
            const dispose = addCleanup(pluginName, cl);
            abortController.signal.addEventListener('abort', () => {
              window.setTimeout(() => {
                dispose();
                cl();
              });
            });
          }
        });
        return () => {
          abortController.abort();
        };
      }
      return;
    }, [pluginName, windowItem]);
    return <div className={pluginContainer} ref={rootRef} />;
  }
);

interface LayoutPanelProps {
  node: LayoutNode;
  editorProps: PageDetailEditorProps;
  depth: number;
}

const LayoutPanel = memo(function LayoutPanel(
  props: LayoutPanelProps
): ReactElement {
  const { node, depth, editorProps } = props;
  const windowItems = useAtomValue(pluginWindowAtom);
  if (typeof node === 'string') {
    if (node === 'editor') {
      return <EditorWrapper {...editorProps} />;
    } else {
      const windowItem = windowItems[node];
      return <PluginContentAdapter pluginName={node} windowItem={windowItem} />;
    }
  } else {
    return (
      <PanelGroup
        direction={node.direction}
        style={depth === 0 ? { height: 'calc(100% - 52px)' } : undefined}
        className={depth === 0 ? editorContainer : undefined}
      >
        <Panel
          defaultSize={node.splitPercentage}
          style={{
            maxWidth: node.maxWidth?.[0],
          }}
        >
          <Suspense>
            <LayoutPanel
              node={node.first}
              editorProps={editorProps}
              depth={depth + 1}
            />
          </Suspense>
        </Panel>
        <PanelResizeHandle />
        <Panel
          defaultSize={100 - node.splitPercentage}
          style={{
            overflow: 'scroll',
            maxWidth: node.maxWidth?.[1],
          }}
        >
          <Suspense>
            <LayoutPanel
              node={node.second}
              editorProps={editorProps}
              depth={depth + 1}
            />
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

  if (layout === 'editor') {
    return (
      <Suspense>
        <PanelGroup
          style={{ height: 'calc(100% - 52px)' }}
          direction="horizontal"
          className={editorContainer}
        >
          <Panel>
            <EditorWrapper {...props} />
          </Panel>
        </PanelGroup>
      </Suspense>
    );
  }

  return (
    <Suspense>
      <LayoutPanel node={layout} editorProps={props} depth={0} />
    </Suspense>
  );
};
