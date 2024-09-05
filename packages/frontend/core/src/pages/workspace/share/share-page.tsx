import { Scrollable } from '@affine/component';
import { AppFallback } from '@affine/core/components/affine/app-container';
import { PageDetailEditor } from '@affine/core/components/page-detail-editor';
import { SharePageNotFoundError } from '@affine/core/components/share-page-not-found-error';
import { AppContainer, MainContainer } from '@affine/core/components/workspace';
import { useActiveBlocksuiteEditor } from '@affine/core/hooks/use-block-suite-editor';
import { usePageDocumentTitle } from '@affine/core/hooks/use-global-state';
import { AuthService } from '@affine/core/modules/cloud';
import {
  type Editor,
  EditorService,
  EditorsService,
} from '@affine/core/modules/editor';
import { PeekViewManagerModal } from '@affine/core/modules/peek-view';
import { ShareReaderService } from '@affine/core/modules/share-doc';
import { CloudBlobStorage } from '@affine/core/modules/workspace-engine';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import { type DocMode, DocModes } from '@blocksuite/blocks';
import { Logo1Icon } from '@blocksuite/icons/rc';
import type { AffineEditorContainer } from '@blocksuite/presets';
import type { Doc, Workspace } from '@toeverything/infra';
import {
  DocsService,
  EmptyBlobStorage,
  FrameworkScope,
  ReadonlyDocStorage,
  useLiveData,
  useService,
  useServices,
  WorkspacesService,
} from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { PageNotFound } from '../../404';
import { ShareFooter } from './share-footer';
import { ShareHeader } from './share-header';
import * as styles from './share-page.css';

export const SharePage = ({
  workspaceId,
  docId,
}: {
  workspaceId: string;
  docId: string;
}) => {
  const { shareReaderService } = useServices({
    ShareReaderService,
  });

  const isLoading = useLiveData(shareReaderService.reader.isLoading$);
  const error = useLiveData(shareReaderService.reader.error$);
  const data = useLiveData(shareReaderService.reader.data$);

  const location = useLocation();

  const [mode, setMode] = useState<DocMode | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const queryStringMode = searchParams.get('mode') as DocMode | null;
    if (queryStringMode && DocModes.includes(queryStringMode)) {
      setMode(queryStringMode);
    }
  }, [location.search]);

  useEffect(() => {
    shareReaderService.reader.loadShare({ workspaceId, docId });
  }, [shareReaderService, docId, workspaceId]);

  if (isLoading) {
    return <AppFallback />;
  }

  if (error) {
    // TODO(@eyhn): show error details
    return <SharePageNotFoundError />;
  }

  if (data) {
    return (
      <SharePageInner
        workspaceId={data.workspaceId}
        docId={data.docId}
        workspaceBinary={data.workspaceBinary}
        docBinary={data.docBinary}
        publishMode={mode || data.publishMode}
      />
    );
  } else {
    return <PageNotFound noPermission />;
  }
};

const SharePageInner = ({
  workspaceId,
  docId,
  workspaceBinary,
  docBinary,
  publishMode = 'page' as DocMode,
}: {
  workspaceId: string;
  docId: string;
  workspaceBinary: Uint8Array;
  docBinary: Uint8Array;
  publishMode?: DocMode;
}) => {
  const workspacesService = useService(WorkspacesService);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [page, setPage] = useState<Doc | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [_, setActiveBlocksuiteEditor] = useActiveBlocksuiteEditor();

  useEffect(() => {
    // create a workspace for share page
    const { workspace } = workspacesService.open(
      {
        metadata: {
          id: workspaceId,
          flavour: WorkspaceFlavour.AFFINE_CLOUD,
        },
        isSharedMode: true,
      },
      {
        getDocStorage() {
          return new ReadonlyDocStorage({
            [workspaceId]: workspaceBinary,
            [docId]: docBinary,
          });
        },
        getAwarenessConnections() {
          return [];
        },
        getDocServer() {
          return null;
        },
        getLocalBlobStorage() {
          return EmptyBlobStorage;
        },
        getRemoteBlobStorages() {
          return [new CloudBlobStorage(workspaceId)];
        },
      }
    );

    setWorkspace(workspace);

    workspace.engine
      .waitForRootDocReady()
      .then(() => {
        const { doc } = workspace.scope.get(DocsService).open(docId);

        workspace.docCollection.awarenessStore.setReadonly(
          doc.blockSuiteDoc.blockCollection,
          true
        );

        setPage(doc);

        const editor = doc.scope.get(EditorsService).createEditor();
        editor.setMode(publishMode);

        setEditor(editor);
      })
      .catch(err => {
        console.error(err);
      });
  }, [
    docId,
    workspaceId,
    workspacesService,
    publishMode,
    workspaceBinary,
    docBinary,
  ]);

  const pageTitle = useLiveData(page?.title$);

  usePageDocumentTitle(pageTitle);

  const onEditorLoad = useCallback(
    (editorContainer: AffineEditorContainer) => {
      setActiveBlocksuiteEditor(editorContainer);
      if (!editor) {
        return;
      }
      editor.setEditorContainer(editorContainer);
      const unbind = editor.bindEditorContainer(
        editorContainer,
        (editorContainer as any).docTitle
      );
      return () => {
        unbind();
        editor.setEditorContainer(null);
      };
    },
    [editor, setActiveBlocksuiteEditor]
  );

  if (!workspace || !page || !editor) {
    return;
  }

  return (
    <FrameworkScope scope={workspace.scope}>
      <FrameworkScope scope={page.scope}>
        <FrameworkScope scope={editor.scope}>
          <AppContainer>
            <MainContainer>
              <div className={styles.root}>
                <div className={styles.mainContainer}>
                  <ShareHeader
                    pageId={page.id}
                    publishMode={publishMode}
                    docCollection={page.blockSuiteDoc.collection}
                  />
                  <Scrollable.Root>
                    <Scrollable.Viewport
                      className={clsx(
                        'affine-page-viewport',
                        styles.editorContainer
                      )}
                    >
                      <PageDetailEditor onLoad={onEditorLoad} />
                      {publishMode === 'page' ? <ShareFooter /> : null}
                    </Scrollable.Viewport>
                    <Scrollable.Scrollbar />
                  </Scrollable.Root>
                  <SharePageFooter />
                </div>
              </div>
            </MainContainer>
            <PeekViewManagerModal />
          </AppContainer>
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
