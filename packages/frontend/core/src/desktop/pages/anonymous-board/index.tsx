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
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { filter, firstValueFrom, timeout } from 'rxjs';

import { PageNotFound } from '../404';

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

      await openedWorkspace.engine.doc.waitForDocLoaded(openedWorkspace.id);
      const docsService = openedWorkspace.scope.get(DocsService);
      await waitForAnonymousDocRecord(docsService, link.docId);

      const { doc } = docsService.open(link.docId);
      doc.blockSuiteDoc.load();
      doc.blockSuiteDoc.readonly = false;
      await openedWorkspace.engine.doc.waitForDocLoaded(link.docId);

      const createdEditor = doc.scope.get(EditorsService).createEditor();
      setPage(doc);
      setEditor(createdEditor);
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
          <PageDetailEditor readonly={false} />
        </FrameworkScope>
      </FrameworkScope>
    </FrameworkScope>
  );
};
