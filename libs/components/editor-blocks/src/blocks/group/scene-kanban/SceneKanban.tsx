import { useKanban, withKanban } from '@toeverything/components/editor-core';
import { CardContainer } from './CardContainer';
import { SceneKanbanContext } from './context';
import { CardContainerWrapper } from './dndable/wrapper/CardContainerWrapper';
import type { ComponentType } from 'react';
import type { CreateView } from '@toeverything/framework/virgo';

export const SceneKanban: ComponentType<CreateView> = withKanban<CreateView>(
    ({ editor, block }) => {
        const { kanban } = useKanban();

        return (
            <SceneKanbanContext.Provider value={{ editor, block }}>
                <CardContainerWrapper
                    dataSource={kanban}
                    render={({
                        activeId,
                        items,
                        containerIds,
                        isSortingContainer,
                    }) => (
                        <CardContainer
                            activeId={activeId}
                            items={items}
                            isSortingContainer={isSortingContainer}
                            containerIds={containerIds}
                        />
                    )}
                />
            </SceneKanbanContext.Provider>
        );
    }
);
