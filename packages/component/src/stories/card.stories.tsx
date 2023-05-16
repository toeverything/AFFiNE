import { BlockCard } from '@affine/component/card/block-card';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import { Workspace } from '@blocksuite/store';

import { WorkspaceCard } from '../components/card/workspace-card';
import { toast } from '../ui/toast';

export default {
  title: 'AFFiNE/Card',
  component: WorkspaceCard,
};

const blockSuiteWorkspace = new Workspace({
  id: 'blocksuite-local',
});

blockSuiteWorkspace.meta.setName('Hello World');

export const AffineWorkspaceCard = () => {
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

export const AffineBlockCard = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <BlockCard title={'New Page'} onClick={() => toast('clicked')} />
      <BlockCard
        title={'New Page'}
        desc={'Write with a blank page'}
        right={<PageIcon width={20} height={20} />}
        onClick={() => toast('clicked page')}
      />
      <BlockCard
        title={'New Edgeless'}
        desc={'Draw with a blank whiteboard'}
        left={<PageIcon width={20} height={20} />}
        right={<EdgelessIcon width={20} height={20} />}
        onClick={() => toast('clicked edgeless')}
      />
    </div>
  );
};
