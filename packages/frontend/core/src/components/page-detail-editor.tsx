import './page-detail-editor.css';

import { useActiveBlocksuiteEditor } from '@affine/core/hooks/use-block-suite-editor';
import { useBlockSuiteWorkspacePage } from '@affine/core/hooks/use-block-suite-workspace-page';
import { assertExists, DisposableGroup } from '@blocksuite/global/utils';
import type { AffineEditorContainer } from '@blocksuite/presets';
import type { Page, Workspace } from '@blocksuite/store';
import { fontStyleOptions } from '@toeverything/infra/atom';
import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import type { CSSProperties } from 'react';
import { memo, Suspense, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { type PageMode, pageSettingFamily } from '../atoms';
import { useAppSettingHelper } from '../hooks/affine/use-app-setting-helper';
import { BlockSuiteEditor as Editor } from './blocksuite/block-suite-editor';
import * as styles from './page-detail-editor.css';

declare global {
  // eslint-disable-next-line no-var
  var currentEditor: AffineEditorContainer | undefined;
}

export type OnLoadEditor = (
  page: Page,
  editor: AffineEditorContainer
) => () => void;

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

const PageDetailEditorMain = memo(function PageDetailEditorMain({
  page,
  pageId,
  onLoad,
  isPublic,
  publishMode,
}: PageDetailEditorProps & { page: Page }) {
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

  const value = useMemo(() => {
    const fontStyle = fontStyleOptions.find(
      option => option.key === appSettings.fontStyle
    );
    assertExists(fontStyle);
    return fontStyle.value;
  }, [appSettings.fontStyle]);

  const [, setActiveBlocksuiteEditor] = useActiveBlocksuiteEditor();
  const blockId = useRouterHash();

  const onLoadEditor = useCallback(
    (editor: AffineEditorContainer) => {
      // debug current detail editor
      globalThis.currentEditor = editor;
      setActiveBlocksuiteEditor(editor);
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

      return () => {
        disposableGroup.dispose();
        setActiveBlocksuiteEditor(null);
      };
    },
    [onLoad, page, setActiveBlocksuiteEditor]
  );

  return (
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
      defaultSelectedBlockId={blockId}
      onLoadEditor={onLoadEditor}
    />
  );
});

export const PageDetailEditor = (props: PageDetailEditorProps) => {
  const { workspace, pageId } = props;
  const page = useBlockSuiteWorkspacePage(workspace, pageId);
  if (!page) {
    return null;
  }
  return (
    <Suspense>
      <PageDetailEditorMain {...props} page={page} />
    </Suspense>
  );
};
