import { Scrollable, uniReactRoot } from '@affine/component';
import type { AffineEditorContainer } from '@affine/core/blocksuite/block-suite-editor';
import { EditorOutlineViewer } from '@affine/core/blocksuite/outline-viewer';
import { useActiveBlocksuiteEditor } from '@affine/core/components/hooks/use-block-suite-editor';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { PageDetailEditor } from '@affine/core/components/page-detail-editor';
import { AppContainer } from '@affine/core/desktop/components/app-container';
import { AuthService, ServerService } from '@affine/core/modules/cloud';
import { type Doc, DocsService } from '@affine/core/modules/doc';
import {
  type Editor,
  type EditorSelector,
  EditorService,
  EditorsService,
} from '@affine/core/modules/editor';
import { PeekViewManagerModal } from '@affine/core/modules/peek-view';
import {
  ViewIcon,
  ViewTitle,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import {
  type Workspace,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { DisposableGroup } from '@blocksuite/affine/global/disposable';
import { RefNodeSlotsProvider } from '@blocksuite/affine/inlines/reference';
import { type DocMode, DocModes } from '@blocksuite/affine/model';
import { Logo1Icon } from '@blocksuite/icons/rc';
import { FrameworkScope, useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { PageNotFound } from '../../404';
import { ShareFooter } from './share-footer';
import { ShareHeader } from './share-header';
import * as styles from './share-page.css';

const useUpdateBasename = (workspace: Workspace | null) => {
  const location = useLocation();
  const basename = location.pathname.match(/\/workspace\/[^/]+/g)?.[0] ?? '/';
  useEffect(() => {
    if (workspace) {
      const workbench = workspace.scope.get(WorkbenchService).workbench;
      workbench.updateBasename(basename);
    }
  }, [basename, workspace]);
};

export const SharePage = ({
  workspaceId,
  docId,
}: {
  workspaceId: string;
  docId: string;
}) => {
  const location = useLocation();

  const { mode, selector, isTemplate, templateName, templateSnapshotUrl } =
    useMemo(() => {
      const searchParams = new URLSearchParams(location.search);
      const queryStringMode = searchParams.get('mode') as DocMode | null;
      const blockIds = searchParams
        .get('blockIds')
        ?.split(',')
        .filter(v => v.length);
      const elementIds = searchParams
        .get('elementIds')
        ?.split(',')
        .filter(v => v.length);

      return {
        mode:
          queryStringMode && DocModes.includes(queryStringMode)
            ? queryStringMode
            : null,
        selector: {
          blockIds,
          elementIds,
          refreshKey: searchParams.get('refreshKey') || undefined,
        },
        isTemplate: searchParams.has('isTemplate'),
        templateName: searchParams.get('templateName') || '',
        templateSnapshotUrl: searchParams.get('snapshotUrl') || '',
      };
    }, [location.search]);

  return (
    <AppContainer>
      <SharePageInner
        workspaceId={workspaceId}
        docId={docId}
        key={workspaceId + ':' + docId}
        publishMode={mode ?? undefined}
        selector={selector}
        isTemplate={isTemplate}
        templateName={templateName}
        templateSnapshotUrl={templateSnapshotUrl}
      />
    </AppContainer>
  );
};

const SharePageInner = ({
  workspaceId,
  docId,
  publishMode = 'page',
  selector,
  isTemplate,
  templateName,
  templateSnapshotUrl,
}: {
  workspaceId: string;
  docId: string;
  publishMode?: DocMode;
  selector?: EditorSelector;
  isTemplate?: boolean;
  templateName?: string;
  templateSnapshotUrl?: string;
}) => {
  const serverService = useService(ServerService);
  const workspacesService = useService(WorkspacesService);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [page, setPage] = useState<Doc | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [noPermission, setNoPermission] = useState(false);
  const [editorContainer, setActiveBlocksuiteEditor] =
    useActiveBlocksuiteEditor();

  useEffect(() => {
    // create a workspace for share page
    const { workspace } = workspacesService.open(
      {
        metadata: {
          id: workspaceId,
          flavour: 'affine-cloud',
        },
        isSharedMode: true,
      },
      {
        local: {
          doc: {
            name: 'StaticCloudDocStorage',
            opts: {
              id: workspaceId,
              serverBaseUrl: serverService.server.baseUrl,
            },
          },
          blob: {
            name: 'CloudBlobStorage',
            opts: {
              id: workspaceId,
              serverBaseUrl: serverService.server.baseUrl,
            },
          },
        },
        remotes: {},
      }
    );

    setWorkspace(workspace);

    workspace.engine.doc
      .waitForDocLoaded(workspace.id)
      .then(async () => {
        const { doc } = workspace.scope.get(DocsService).open(docId);
        doc.blockSuiteDoc.load();
        doc.blockSuiteDoc.readonly = true;

        await workspace.engine.doc.waitForDocLoaded(docId);

        if (!doc.blockSuiteDoc.root) {
          throw new Error('Doc is empty');
        }

        setPage(doc);

        const editor = doc.scope.get(EditorsService).createEditor();
        editor.setMode(publishMode);

        if (selector) {
          editor.setSelector(selector);
        }

        setEditor(editor);
      })
      .catch(err => {
        console.error(err);
        setNoPermission(true);
      });
  }, [
    docId,
    workspaceId,
    workspacesService,
    publishMode,
    selector,
    serverService.server.baseUrl,
  ]);

  const t = useI18n();
  const pageTitle = useLiveData(page?.title$);
  const { jumpToPageBlock, openPage } = useNavigateHelper();
  useUpdateBasename(workspace);

  const onEditorLoad = useCallback(
    (editorContainer: AffineEditorContainer) => {
      setActiveBlocksuiteEditor(editorContainer);
      if (!editor) {
        return;
      }
      const unbind = editor.bindEditorContainer(editorContainer);

      const disposable = new DisposableGroup();
      const refNodeSlots =
        editorContainer.host?.std.getOptional(RefNodeSlotsProvider);
      if (refNodeSlots) {
        disposable.add(
          refNodeSlots.docLinkClicked.subscribe(({ pageId, params }) => {
            if (params) {
              const { mode, blockIds, elementIds } = params;
              jumpToPageBlock(workspaceId, pageId, mode, blockIds, elementIds);
              return;
            }

            if (editor.doc.id === pageId) {
              return;
            }

            return openPage(workspaceId, pageId);
          })
        );
      }

      return () => {
        unbind();
      };
    },
    [editor, setActiveBlocksuiteEditor, jumpToPageBlock, openPage, workspaceId]
  );

  if (noPermission) {
    return <PageNotFound noPermission />;
  }

  if (!workspace || !page || !editor) {
    return null;
  }

  return (
    <FrameworkScope scope={workspace.scope}>
      <FrameworkScope scope={page.scope}>
        <FrameworkScope scope={editor.scope}>
          <ViewIcon icon={publishMode === 'page' ? 'doc' : 'edgeless'} />
          <ViewTitle title={pageTitle ?? t['unnamed']()} />
          <div className={styles.root}>
            <div className={styles.mainContainer}>
              <ShareHeader
                pageId={page.id}
                publishMode={publishMode}
                isTemplate={isTemplate}
                templateName={templateName}
                snapshotUrl={templateSnapshotUrl}
              />
              <Scrollable.Root>
                <Scrollable.Viewport
                  className={clsx(
                    'affine-page-viewport',
                    styles.editorContainer
                  )}
                >
                  <PageDetailEditor onLoad={onEditorLoad} readonly />
                  {publishMode === 'page' && !BUILD_CONFIG.isElectron ? (
                    <ShareFooter />
                  ) : null}
                </Scrollable.Viewport>
                <Scrollable.Scrollbar />
              </Scrollable.Root>
              <EditorOutlineViewer
                editor={editorContainer?.host ?? null}
                show={publishMode === 'page'}
              />
              {!BUILD_CONFIG.isElectron && <SharePageFooter />}
            </div>
          </div>
          <PeekViewManagerModal />
          <uniReactRoot.Root />
        </FrameworkScope>
      </FrameworkScope>
    </FrameworkScope>
  );
};

const SharePageFooter = () => {
  const t = useI18n();
  const editorService = useService(EditorService);
  const isPresent = useLiveData(editorService.editor.isPresenting$);
  const authService = useService(AuthService);
  const loginStatus = useLiveData(authService.session.status$);

  if (isPresent || loginStatus === 'authenticated') {
    return null;
  }
  return (
    <a
      href="https://affine.pro"
      target="_blank"
      className={styles.link}
      rel="noreferrer"
    >
      <span className={styles.linkText}>
        {t['com.affine.share-page.footer.built-with']()}
      </span>
      <Logo1Icon fontSize={20} />
    </a>
  );
};
