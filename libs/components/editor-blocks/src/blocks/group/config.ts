import { RecastScene } from '@toeverything/components/editor-core';

export const PANEL_CONFIG = {
    FILTER: 'filter',
    SORTER: 'sorter',
    ADD_VIEW: 'add_view',
    GROUP_BY: 'group_by',
} as const;

/**
 * See {@link RecastScene}
 */
export const SCENE_CONFIG: Record<Uppercase<RecastScene>, string> = {
    PAGE: 'page',
    KANBAN: 'kanban',
    TABLE: 'table',
} as const;
