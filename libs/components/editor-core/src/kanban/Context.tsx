import { genErrorObj } from '@toeverything/utils';
import {
    ComponentType,
    createContext,
    ReactElement,
    type ReactNode,
} from 'react';
import {
    RecastBlock,
    RecastMetaProperty,
    RecastPropertyId,
} from '../recast-block/types';
import { useInitKanbanEffect, useRecastKanban } from './kanban';
import { KanbanGroup } from './types';

type KanbanState = {
    groupBy: RecastMetaProperty;
    kanban: KanbanGroup[];
    recastBlock: RecastBlock;
    setGroupBy: (id: RecastPropertyId) => Promise<void>;
};

export const KanbanContext = createContext<KanbanState>(
    genErrorObj(
        'Failed to get KanbanContext! Please use the hook under `KanbanProvider`.'
        // Just for type cast
    ) as KanbanState
);

/**
 * Provide the kanban context to the children.
 *
 * The Provider has effect to init the groupBy property.
 */
export const KanbanProvider = ({
    fallback,
    children,
}: {
    fallback: ReactElement;
    children: ReactNode;
}): JSX.Element => {
    const [loading, groupBy] = useInitKanbanEffect();
    const { kanban, setGroupBy, recastBlock } = useRecastKanban();

    if (loading || !kanban.length) {
        return fallback;
    }

    const value = {
        groupBy,
        kanban,
        setGroupBy,
        recastBlock,
    };

    return (
        <KanbanContext.Provider value={value}>
            {children}
        </KanbanContext.Provider>
    );
};

/**
 * Wrap your component with {@link KanbanProvider} to get access to the recast block state
 * @public
 */
export const withKanban =
    <T,>(Component: ComponentType<T>): ComponentType<T> =>
    (props: T) => {
        return (
            <KanbanProvider fallback={<div>Loading</div>}>
                <Component {...props} />
            </KanbanProvider>
        );
    };
