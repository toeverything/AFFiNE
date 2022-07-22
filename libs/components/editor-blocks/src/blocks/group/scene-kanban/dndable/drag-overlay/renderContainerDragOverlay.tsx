import { CardItemWrapper } from '../wrapper/CardItemWrapper';
import { CardItem } from '../../CardItem';
import type { KanbanCard } from '@toeverything/components/editor-core';
import type { DndableItems } from '../type';

export function renderContainerDragOverlay({
    containerId,
    items,
}: {
    containerId: string;
    items: DndableItems;
}) {
    return (
        <div style={{ height: '100%' }}>
            {items[containerId].map((item, index) => {
                const { id, block } = item;

                return (
                    <CardItemWrapper
                        key={id}
                        card={<CardItem key={id} id={id} block={block} />}
                        index={index}
                    />
                );
            })}
        </div>
    );
}
