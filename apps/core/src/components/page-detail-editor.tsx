import './page-detail-editor.css';

import { PageNotFoundError } from '@affine/env/constant';
import { rootBlockHubAtom } from '@affine/workspace/atom';
import type { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { Page, Workspace } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspacePage } from '@toeverything/hooks/use-block-suite-workspace-page';
import { affinePluginsAtom } from '@toeverything/plugin-infra/manager';
import type {
  AffinePlugin,
  LayoutNode,
  PluginUIAdapter,
} from '@toeverything/plugin-infra/type';
import type { PluginBlockSuiteAdapter } from '@toeverything/plugin-infra/type';
import clsx from 'clsx';
import { useAtomValue, useSetAtom } from 'jotai';
import type { CSSProperties, FC, ReactElement } from 'react';
import { memo, Suspense, useCallback, useMemo } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { pageSettingFamily } from '../atoms';
import { contentLayoutAtom } from '../atoms/layout';
import { fontStyleOptions, useAppSetting } from '../atoms/settings';
import { BlockSuiteEditor as Editor } from './blocksuite/block-suite-editor';
import { editor } from './page-detail-editor.css';
import { pluginContainer } from './page-detail-editor.css';

export type PageDetailEditorProps = {
  isPublic?: boolean;
  workspace: Workspace;
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
  const affinePluginsMap = useAtomValue(affinePluginsAtom);
  const plugins = useMemo(
    () => Object.values(affinePluginsMap),
    [affinePluginsMap]
  );
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
    <Editor
      className={clsx(editor, {
        'full-screen': appSettings.fullWidthLayout,
      })}
      style={
        {
          '--affine-font-family': value,
        } as CSSProperties
      }
      key={`${workspace.id}-${pageId}`}
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
          const uiDecorators = plugins
            .map(plugin => plugin.blockSuiteAdapter.uiDecorator)
            .filter((ui): ui is PluginBlockSuiteAdapter['uiDecorator'] =>
              Boolean(ui)
            );
          const disposes = uiDecorators.map(ui => ui(editor));
          return () => {
            disposes.forEach(fn => fn());
            dispose();
          };
        },
        [plugins, onLoad]
      )}
    />
  );
});

const PluginContentAdapter = memo<{
  detailContent: PluginUIAdapter['detailContent'];
}>(function PluginContentAdapter({ detailContent }) {
  return (
    <div className={pluginContainer}>
      {detailContent({
        contentLayoutAtom,
      })}
    </div>
  );
});

type LayoutPanelProps = {
  node: LayoutNode;
  editorProps: PageDetailEditorProps;
  plugins: AffinePlugin<string>[];
};

const LayoutPanel = memo(function LayoutPanel(
  props: LayoutPanelProps
): ReactElement {
  const node = props.node;
  if (typeof node === 'string') {
    if (node === 'editor') {
      return <EditorWrapper {...props.editorProps} />;
    } else {
      const plugin = props.plugins.find(
        plugin => plugin.definition.id === node
      );
      const Content = plugin?.uiAdapter.detailContent;
      assertExists(Content);
      return <PluginContentAdapter detailContent={Content} />;
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
            <LayoutPanel
              node={node.first}
              editorProps={props.editorProps}
              plugins={props.plugins}
            />
          </Suspense>
        </Panel>
        <PanelResizeHandle />
        <Panel defaultSize={100 - node.splitPercentage}>
          <Suspense>
            <LayoutPanel
              node={node.second}
              editorProps={props.editorProps}
              plugins={props.plugins}
            />
          </Suspense>
        </Panel>
      </PanelGroup>
    );
  }
});

export const PageDetailEditor: FC<PageDetailEditorProps> = props => {
  const { workspace, pageId } = props;
  const page = useBlockSuiteWorkspacePage(workspace, pageId);
  if (!page) {
    throw new PageNotFoundError(workspace, pageId);
  }

  const layout = useAtomValue(contentLayoutAtom);
  const affinePluginsMap = useAtomValue(affinePluginsAtom);
  const plugins = useMemo(
    () => Object.values(affinePluginsMap),
    [affinePluginsMap]
  );

  return (
    <>
      <Suspense>
        <LayoutPanel node={layout} editorProps={props} plugins={plugins} />
      </Suspense>
    </>
  );
};
