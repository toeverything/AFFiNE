import { MainContainer } from '@affine/component/workspace';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { getOrCreateWorkspace } from '@affine/workspace/manager';
import { assertExists } from '@blocksuite/global/utils';
import { Button } from '@toeverything/components/button';
import { getCurrentStore } from '@toeverything/infra/atom';
import { forceUpgradePages } from '@toeverything/infra/blocksuite';
import { useCallback } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { redirect, useSearchParams } from 'react-router-dom';

import { AppContainer } from '../components/affine/app-container';
import { useWorkspace } from '../hooks/use-workspace';

export const loader: LoaderFunction = async args => {
  const queryParams = new URL(args.request.url).searchParams;
  const workspaceId = queryParams.get('workspace_id');
  if (!workspaceId) {
    return redirect('/404');
  }
  const metadata = await getCurrentStore().get(rootWorkspacesMetadataAtom);
  const currentMetadata = metadata.find(m => m.id === workspaceId);
  if (!currentMetadata) {
    return redirect('/404');
  }
  // invoke the workspace manager to create the workspace
  getOrCreateWorkspace(currentMetadata.id, currentMetadata.flavour);
  return null;
};

type MigrationPageProps = {
  workspaceId: string;
};
const MigrationPage = function MigrationPage(props: MigrationPageProps) {
  const workspace = useWorkspace(props.workspaceId);
  const handleClick = useCallback(() => {
    forceUpgradePages({
      getCurrentRootDoc: async () => workspace.blockSuiteWorkspace.doc,
      getSchema: () => workspace.blockSuiteWorkspace.schema,
    })
      .then(() => {})
      .catch(error => {
        console.error('Failed to upgrade pages', error);
      });
  }, [workspace.blockSuiteWorkspace.doc, workspace.blockSuiteWorkspace.schema]);
  return (
    <AppContainer>
      <MainContainer>
        <Button onClick={handleClick}>Upgrade Workspace</Button>
      </MainContainer>
    </AppContainer>
  );
};

export const Component = () => {
  const [params] = useSearchParams();
  const workspaceId = params.get('workspace_id');
  assertExists(workspaceId, 'workspaceId should not be null');
  return <MigrationPage workspaceId={workspaceId} />;
};
