import type { WorkspaceListProps } from '@affine/component/workspace-list';
import { WorkspaceList } from '@affine/component/workspace-list';
import { workspaceListAtom } from '@affine/workspace/atom';
import type { Meta } from '@storybook/react';
import { useAtomValue } from 'jotai';

export default {
  title: 'AFFiNE/WorkspaceList',
  component: WorkspaceList,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta<WorkspaceListProps>;

export const Default = () => {
  const list = useAtomValue(workspaceListAtom);
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
