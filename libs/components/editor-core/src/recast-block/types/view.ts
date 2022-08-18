import { RecastPropertyId } from './recast-property';

export enum RecastScene {
    /**
     * normal view
     */
    Page = 'page',
    Kanban = 'kanban',
    Table = 'table',
}

export type RecastViewId = string & {
    /**
     * Type differentiator only.
     */
    readonly __isViewId: true;
};

type BaseView = {
    id: RecastViewId;
    name: string;
    // TODO: design this
    // order?: string[];
};

export interface PageView extends BaseView {
    type: RecastScene.Page;
}

export interface KanbanView extends BaseView {
    type: RecastScene.Kanban;
    groupBy?: RecastPropertyId;
}

export interface TableView extends BaseView {
    type: RecastScene.Table;
}

export type RecastView = PageView | KanbanView | TableView;
export type RecastViewWithoutId = Omit<RecastView, 'id'>;
