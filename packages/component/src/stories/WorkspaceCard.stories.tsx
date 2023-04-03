import { WorkspaceFlavour } from '@affine/workspace/type';
import { Workspace } from '@blocksuite/store';

import { WorkspaceCard } from '../components/workspace-card';

export default {
  title: 'AFFiNE/WorkspaceCard',
  component: WorkspaceCard,
};

const blockSuiteWorkspace = new Workspace({
  id: 'blocksuite-local',
});

blockSuiteWorkspace.meta.setName('Hello World');

export const Basic = () => {
  return (
    <WorkspaceCard
      workspace={{
        flavour: WorkspaceFlavour.LOCAL,
        id: 'local',
        blockSuiteWorkspace,
        providers: [],
      }}
      onClick={() => {}}
      onSettingClick={() => {}}
      currentWorkspaceId={null}
    />
  );
};
