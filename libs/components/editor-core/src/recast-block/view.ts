import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import { useRecastBlock } from './Context';
import {
    KanbanView,
    META_CURRENT_VIEW_ID_KEY,
    META_VIEWS_KEY,
    RecastPropertyId,
    RecastScene,
    RecastView,
    RecastViewId,
    RecastViewWithoutId,
} from './types';

/**
 * Generate a unique id for a recast view
 */
const genViewId = () => nanoid(16) as RecastViewId; // This is a safe type cast

const DEFAULT_VIEWS: RecastView[] = [
    {
        id: genViewId(),
        name: 'List',
        type: RecastScene.Page,
    },
    {
        id: genViewId(),
        name: 'Kanban',
        type: RecastScene.Kanban,
    },
];

/**
 * Get the current view of the group
 */
export const useCurrentView = () => {
    const recastBlock = useRecastBlock();
    const recastViews =
        recastBlock.getProperty(META_VIEWS_KEY) ?? DEFAULT_VIEWS;

    const currentViewId = recastBlock.getProperty(META_CURRENT_VIEW_ID_KEY);
    const currentView =
        recastViews.find(v => v.id === currentViewId) ?? recastViews[0];

    const setCurrentView = useCallback(
        async (newView: RecastView) => {
            await recastBlock.setProperty(META_CURRENT_VIEW_ID_KEY, newView.id);
        },
        [recastBlock]
    );
    return [currentView, setCurrentView] as const;
};

export const useRecastView = () => {
    const recastBlock = useRecastBlock();
    const recastViews =
        recastBlock.getProperty(META_VIEWS_KEY) ?? DEFAULT_VIEWS;
    const [currentView, setCurrentView] = useCurrentView();

    const getView = useCallback(
        (id: RecastViewId) => {
            const view = recastViews.find(v => v.id === id);
            if (!view) {
                throw new Error('Failed to find view with id ' + id);
            }
            return view;
        },
        [recastViews]
    );

    const setViews = useCallback(
        (views: RecastView[]) => {
            return recastBlock.setProperty(META_VIEWS_KEY, views);
        },
        [recastBlock]
    );

    const addView = useCallback(
        async (newView: RecastViewWithoutId) => {
            await setViews([
                ...recastViews,
                { ...newView, id: genViewId() } as RecastView,
            ]);
        },
        [recastViews, setViews]
    );

    const updateView = useCallback(
        async (newView: RecastView) => {
            const idx = recastViews.findIndex(v => v.id === newView.id);
            if (!idx) {
                throw new Error('Failed to find view with id ' + newView.id);
            }
            await setViews([
                ...recastViews.slice(0, idx),
                newView,
                ...recastViews.slice(idx + 1),
            ]);
        },
        [recastViews, setViews]
    );

    const renameView = useCallback(
        async (id: RecastViewId, newName: string) => {
            const curView = getView(id);
            curView.name = newName;
            await setViews(recastViews);
        },
        [getView, recastViews, setViews]
    );

    const removeView = useCallback(
        async (id: RecastViewId) => {
            if (recastViews.length <= 1) {
                throw new Error('Can not remove the last view! view id: ' + id);
            }
            await setViews(recastViews.filter(v => v.id !== id));
        },
        [recastViews, setViews]
    );

    /**
     * @deprecated Use updateView instead
     */
    const changeScene = useCallback(
        async (
            id: RecastViewId,
            newScene: RecastScene.Page | RecastScene.Kanban
        ) => {
            const curView = getView(id);
            if (curView.type === newScene) {
                return;
            }
            curView.type = newScene;
            await setViews(recastViews);
        },
        [getView, recastViews, setViews]
    );

    return {
        currentView,
        recastViews,
        setCurrentView,
        addView,
        updateView,
        renameView,
        removeView,
    };
};
