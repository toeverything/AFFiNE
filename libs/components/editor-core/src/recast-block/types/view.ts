import { RecastPropertyId } from './recast-property';

export enum RecastScene {
    /**
     * normal view
     */
    Page = 'page',
    Kanban = 'kanban',
    Table = 'table',
    Whiteboard = 'whiteboard',
}

type BaseView = {
    name: string;
    // TODO: design this
    // order?: string[];
};

export interface PageView extends BaseView {
    type: RecastScene.Page;
}

export interface KanbanView extends BaseView {
    type: RecastScene.Kanban;
    groupBy: RecastPropertyId;
}

export type RecastView = PageView | KanbanView;
