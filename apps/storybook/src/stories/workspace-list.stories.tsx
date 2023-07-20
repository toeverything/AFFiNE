import type { WorkspaceListProps } from '@affine/component/workspace-list';
import { WorkspaceList } from '@affine/component/workspace-list';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { getOrCreateWorkspace } from '@affine/workspace/manager';
import { arrayMove } from '@dnd-kit/sortable';
import type { Meta } from '@storybook/react';
import { useState } from 'react';

export default {
  title: 'AFFiNE/WorkspaceList',
  component: WorkspaceList,
} satisfies Meta<WorkspaceListProps>;

export const Default = () => {
  const [items, setItems] = useState(() => {
    const items = [
      {
        id: '1',
        flavour: WorkspaceFlavour.LOCAL,
        blockSuiteWorkspace: getOrCreateWorkspace('1', WorkspaceFlavour.LOCAL),
      },
      {
        id: '2',
        flavour: WorkspaceFlavour.LOCAL,
        blockSuiteWorkspace: getOrCreateWorkspace('2', WorkspaceFlavour.LOCAL),
      },
      {
        id: '3',
        flavour: WorkspaceFlavour.LOCAL,
        blockSuiteWorkspace: getOrCreateWorkspace('3', WorkspaceFlavour.LOCAL),
      },
    ] satisfies WorkspaceListProps['items'];

    items.forEach(item => {
      item.blockSuiteWorkspace.meta.setName(item.id);
    });

    return items;
  });
  return (
    <WorkspaceList
      currentWorkspaceId={null}
      items={items}
      onClick={() => {}}
      onSettingClick={() => {}}
      onDragEnd={event => {
        const { active, over } = event;

        if (active.id !== over?.id) {
          setItems(items => {
            const oldIndex = items.findIndex(item => item.id === active.id);
            const newIndex = items.findIndex(item => item.id === over?.id);

            return arrayMove(items, oldIndex, newIndex);
          });
        }
      }}
    />
  );
};
