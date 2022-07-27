import { RecastView } from '@toeverything/components/editor-core';
import {
    KanBanIcon,
    TableIcon,
    TodoListIcon,
} from '@toeverything/components/icons';
import type { ReactElement } from 'react';

export const VIEW_ICON_MAP: Record<RecastView['type'], ReactElement> = {
    page: <TodoListIcon fontSize="small" />,
    kanban: <KanBanIcon fontSize="small" />,
    table: <TableIcon fontSize="small" />,
};
