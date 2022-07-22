import { CardItem } from '../../CardItem';
import { CardItemWrapper } from '../wrapper/CardItemWrapper';
import { findContainer } from '../helper';
import type { DndableItems } from '../type';

export function renderSortableItemDragOverlay({
    activeId,
    items,
}: {
    activeId: string;
    items: DndableItems;
}) {
    const activeContainer = findContainer(activeId, items);
    const item = items[activeContainer].find(item => item.id === activeId);

    return <CardItemWrapper card={<CardItem {...item} />} dragOverlay />;
}
