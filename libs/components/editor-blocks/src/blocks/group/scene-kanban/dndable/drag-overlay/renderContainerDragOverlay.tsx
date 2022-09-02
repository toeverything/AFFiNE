import { CardItem } from '../../CardItem';
import type { DndableItems } from '../type';
import { CardItemWrapper } from '../wrapper/CardItemWrapper';

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
                        card={<CardItem key={id} block={block} />}
                        index={index}
                    />
                );
            })}
        </div>
    );
}
