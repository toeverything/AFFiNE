import {
    DndContext,
    MeasuringStrategy,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { useDndable } from './use-dndable';
import {
    horizontalListSortingStrategy,
    SortableContext,
} from '@dnd-kit/sortable';
import { DragOverlayPortal } from '../drag-overlay/DragOverlayPortal';
import { transformKanban2DndFormat } from '../helper';
import type { ReactNode } from 'react';
import type { KanbanGroup } from '@toeverything/components/editor-core';
import type { DndableItems } from '../type';

interface RenderParams {
    containerIds: string[];
    items: DndableItems;
    isSortingContainer?: boolean;
    activeId?: string;
}

interface Props {
    dataSource: KanbanGroup[];
    render: (params: RenderParams) => ReactNode;
}

export const CardContainerWrapper = (props: Props) => {
    const { dataSource, render } = props;
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 15,
            },
        })
    );

    const [
        { active, containerIds, items, collisionDetectionStrategy },
        { onDragStart, onDragOver, onDragEnd },
    ] = useDndable(...transformKanban2DndFormat(dataSource));
    const activeId = active?.id as string;
    const isSortingContainer = activeId
        ? containerIds.includes(activeId)
        : false;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            measuring={{
                droppable: {
                    strategy: MeasuringStrategy.Always,
                },
            }}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
        >
            <SortableContext
                items={containerIds}
                strategy={horizontalListSortingStrategy}
            >
                {render({ activeId, containerIds, items, isSortingContainer })}
            </SortableContext>

            <DragOverlayPortal
                items={items}
                activeId={activeId}
                containerIds={containerIds}
            />
        </DndContext>
    );
};
