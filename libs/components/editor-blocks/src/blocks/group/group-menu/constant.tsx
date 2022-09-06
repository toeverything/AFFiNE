import { RecastScene } from '@toeverything/components/editor-core';
import { KanBanIcon, TodoListIcon } from '@toeverything/components/icons';

export const VIEW_LIST = [
    {
        name: 'Text',
        scene: RecastScene.Page,
        icon: <TodoListIcon fontSize="small" />,
    },
    {
        name: 'Kanban',
        scene: RecastScene.Kanban,
        icon: <KanBanIcon fontSize="small" />,
    },
    // {
    //     name: 'Table',
    //     scene: RecastScene.Table,
    //     icon: <TableIcon fontSize="small" />,
    // },
] as const;
