import { useCallback } from 'react';
import { useRecastBlock } from './Context';
import { RecastScene } from './types';

/**
 * Get the recast table state
 *
 * 获取/设置多维区块场景
 * @public
 */
export const useRecastBlockScene = () => {
    const groupBlock = useRecastBlock();
    const DEFAULT_SCENE = RecastScene.Page;
    let maybeScene = groupBlock.getProperty('scene');
    // TODO remove this
    // Backward compatible
    if (maybeScene && typeof maybeScene !== 'string') {
        groupBlock.setProperty('scene', DEFAULT_SCENE);
        maybeScene = DEFAULT_SCENE;
    }
    // End of backward compatible
    const scene = maybeScene ?? DEFAULT_SCENE;

    const setScene = useCallback(
        (scene: RecastScene) => {
            return groupBlock.setProperty('scene', scene);
        },
        [groupBlock]
    );

    const setPage = useCallback(() => setScene(RecastScene.Page), [setScene]);
    const setTable = useCallback(() => setScene(RecastScene.Table), [setScene]);
    const setKanban = useCallback(
        () => setScene(RecastScene.Kanban),
        [setScene]
    );

    return {
        scene,
        setScene,
        setPage,
        setTable,
        setKanban,
    };
};
