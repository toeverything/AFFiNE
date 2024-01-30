import type { WorkspaceListProps } from '@affine/component/workspace-list';
import { WorkspaceList } from '@affine/component/workspace-list';
import type { Meta } from '@storybook/react';
import { WorkspaceManager } from '@toeverything/infra';
import { useLiveData, useService } from '@toeverything/infra';

export default {
  title: 'AFFiNE/WorkspaceList',
  component: WorkspaceList,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta<WorkspaceListProps>;

export const Default = () => {
  const list = useLiveData(useService(WorkspaceManager).list.workspaceList);
  return (
    <WorkspaceList
      currentWorkspaceId={null}
      items={list}
      onClick={() => {}}
      onSettingClick={() => {}}
      onDragEnd={_ => {}}
      useWorkspaceAvatar={() => undefined}
      useWorkspaceName={() => undefined}
      useIsWorkspaceOwner={() => false}
    />
  );
};
