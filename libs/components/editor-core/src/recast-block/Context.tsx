import { Protocol } from '@toeverything/datasource/db-service';
import { AsyncBlock } from '../editor';
import { ComponentType, createContext, ReactNode, useContext } from 'react';
import { RecastBlock } from './types';

/**
 * Determine whether the block supports RecastBlock
 */
export const isRecastBlock = (block: unknown): block is RecastBlock => {
    if (!(block instanceof AsyncBlock)) {
        return false;
    }
    return (
        block.type === Protocol.Block.Type.page ||
        block.type === Protocol.Block.Type.group
    );
};

/**
 * Remove legacy properties
 */
const normalizeRecastBlockData = (block: RecastBlock) => {
    if (block.getProperty('scene')) {
        block.removeProperty('scene');
    }
    if (block.getProperty('kanbanProps')) {
        block.removeProperty('kanbanProps');
    }
};

export const RecastBlockContext = createContext<RecastBlock | null>(null);

export const RecastBlockProvider = ({
    block,
    children,
}: {
    block: AsyncBlock;
    children: ReactNode;
}) => {
    if (!isRecastBlock(block)) {
        throw new Error(
            'RecastBlockProvider only works for page and group block'
        );
    }

    normalizeRecastBlockData(block);

    return (
        <RecastBlockContext.Provider value={block}>
            {children}
        </RecastBlockContext.Provider>
    );
};

/**
 * Get the root recast block
 * @private
 */
export const useRecastBlock = () => {
    const recastBlock = useContext(RecastBlockContext);
    if (!recastBlock) {
        throw new Error(
            'Failed to find recastBlock! Please use the hook under `RecastBlockProvider`.'
        );
    }
    return recastBlock;
};

/**
 * Wrap your component with {@link RecastBlockProvider} to get access to the recast block state
 * @public
 */
export const withRecastBlock =
    <T extends { block: AsyncBlock }>(
        Component: ComponentType<T>
    ): ComponentType<T> =>
    props => {
        return (
            <RecastBlockProvider block={props.block}>
                <Component {...props} />
            </RecastBlockProvider>
        );
    };
