import { toast } from '@affine/component';
import { BlockCard } from '@affine/component/card/block-card';
import { WorkspaceCard } from '@affine/component/card/workspace-card';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';

export default {
  title: 'AFFiNE/Card',
  component: WorkspaceCard,
};

const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
  'blocksuite-local',
  WorkspaceFlavour.LOCAL
);

blockSuiteWorkspace.meta.setName('Hello World');

export const AffineWorkspaceCard = () => {
  return (
    <WorkspaceCard
      meta={{
        id: 'blocksuite-local',
        flavour: WorkspaceFlavour.LOCAL,
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
