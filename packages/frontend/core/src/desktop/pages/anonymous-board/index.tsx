import { Scrollable } from '@affine/component';
import type { AffineEditorContainer } from '@affine/core/blocksuite/block-suite-editor';
import { PageDetailEditor } from '@affine/core/components/page-detail-editor';
import { AppContainer } from '@affine/core/desktop/components/app-container';
import { GraphQLService, ServerService } from '@affine/core/modules/cloud';
import { type Doc, DocsService } from '@affine/core/modules/doc';
import { type Editor, EditorsService } from '@affine/core/modules/editor';
import {
  type Workspace,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import type { ResolveAnonymousDocAccessLinkMutation } from '@affine/graphql';
import {
  resolveAnonymousDocAccessLinkMutation,
  ServerDeploymentType,
} from '@affine/graphql';
import { FrameworkScope, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { filter, firstValueFrom, timeout } from 'rxjs';

import { PageNotFound } from '../404';
import * as styles from './styles.css';

const waitForAnonymousDocRecord = async (
  docsService: DocsService,
  docId: string
): Promise<void> => {
  if (docsService.list.doc$(docId).value) {
    return;
  }

  await firstValueFrom(
    docsService.list.doc$(docId).pipe(filter(Boolean), timeout(3000))
  );
};

export const Component = () => {
  const { token } = useParams();

  return (
    <AppContainer>
      {token ? <AnonymousBoard token={token} /> : <PageNotFound />}
    </AppContainer>
  );
};

const AnonymousBoard = ({ token }: { token: string }) => {
  const gqlService = useService(GraphQLService);
  const serverService = useService(ServerService);
  const workspacesService = useService(WorkspacesService);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [page, setPage] = useState<Doc | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [failed, setFailed] = useState(false);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  const onLoad = useCallback(
    (editorContainer: AffineEditorContainer) =>
      editor?.bindEditorContainer(
        editorContainer,
        editorContainer.docTitle,
        scrollViewportRef.current
      ),
    [editor]
  );

  useEffect(() => {
    let disposed = false;
    let disposeWorkspace: (() => void) | undefined;

    void (async () => {
      const resolved: ResolveAnonymousDocAccessLinkMutation =
        await gqlService.gql({
          query: resolveAnonymousDocAccessLinkMutation,
          variables: {
            token,
            displayName: `Guest ${Math.floor(Math.random() * 1000)}`,
          },
        });

      if (disposed) {
        return;
      }

      const { guestToken, link } = resolved.resolveAnonymousDocAccessLink;
      const { workspace: openedWorkspace, dispose } = workspacesService.open(
        {
          metadata: {
            id: link.workspaceId,
            flavour: 'affine-cloud',
          },
          isSharedMode: true,
        },
        {
          local: {
            doc: {
              name: 'CloudDocStorage',
              opts: {
                type: 'workspace',
                id: link.workspaceId,
                serverBaseUrl: serverService.server.baseUrl,
                anonymousGuestToken: guestToken,
                anonymousDocId: link.docId,
                isSelfHosted:
                  serverService.server.config$.value.type ===
                  ServerDeploymentType.Selfhosted,
              },
            },
            blob: {
              name: 'CloudBlobStorage',
              opts: {
                id: link.workspaceId,
                serverBaseUrl: serverService.server.baseUrl,
                anonymousGuestToken: guestToken,
                anonymousDocId: link.docId,
              },
            },
            awareness: {
              name: 'CloudAwarenessStorage',
              opts: {
                type: 'workspace',
                id: link.workspaceId,
                serverBaseUrl: serverService.server.baseUrl,
                anonymousGuestToken: guestToken,
                isSelfHosted:
                  serverService.server.config$.value.type ===
                  ServerDeploymentType.Selfhosted,
              },
            },
          },
          remotes: {},
        }
      );

      disposeWorkspace = dispose;
      setWorkspace(openedWorkspace);

      const docsService = openedWorkspace.scope.get(DocsService);
      if (!docsService.list.doc$(link.docId).value) {
        openedWorkspace.docCollection.meta.initialize();
        openedWorkspace.docCollection.meta.addDocMeta({
          id: link.docId,
          title: 'Anonymous board',
          createDate: Date.now(),
          tags: [],
        });
      }
      await waitForAnonymousDocRecord(docsService, link.docId);

      const { doc } = docsService.open(link.docId);
      doc.blockSuiteDoc.load();
      doc.blockSuiteDoc.readonly = false;

      const createdEditor = doc.scope.get(EditorsService).createEditor();
      createdEditor.setMode('edgeless');
      setPage(doc);
      setEditor(createdEditor);
      void openedWorkspace.engine.doc.waitForDocLoaded(link.docId).catch(() => {
        // The editor still renders the current local doc state; sync retries are owned by nbstore.
      });
    })().catch(error => {
      console.error(error);
      if (!disposed) {
        setFailed(true);
      }
    });

    return () => {
      disposed = true;
      disposeWorkspace?.();
    };
  }, [gqlService, serverService, token, workspacesService]);

  if (failed) {
    return <PageNotFound />;
  }

  if (!workspace || !page || !editor) {
    return null;
  }

  return (
    <FrameworkScope scope={workspace.scope}>
      <FrameworkScope scope={page.scope}>
        <FrameworkScope scope={editor.scope}>
          <div className={styles.root}>
            <Scrollable.Root>
              <Scrollable.Viewport
                ref={scrollViewportRef}
                className={clsx('affine-page-viewport', styles.editorContainer)}
              >
                <PageDetailEditor onLoad={onLoad} readonly={false} />
              </Scrollable.Viewport>
              <Scrollable.Scrollbar />
            </Scrollable.Root>
          </div>
        </FrameworkScope>
      </FrameworkScope>
    </FrameworkScope>
  );
};
