/**
 * Data format conversion
 * @param data
 */
import type { DndableItems } from './type';
import type {
    KanbanCard,
    KanbanGroup,
    RecastItem,
} from '@toeverything/components/editor-core';
import { isEqual } from '@toeverything/utils';

const transformKanban2DndFormat = (dataSource: KanbanGroup[]) => {
    return dataSource.reduce<[DndableItems, string[]]>(
        (tuple, current) => {
            const { id, items } = current;
            const [dndableItems, dndableContainerIds] = tuple;
            return [
                { ...dndableItems, [id]: items },
                [...dndableContainerIds, id],
            ];
        },
        [{}, []]
    );
};

const findContainer = (id: string, items: DndableItems) => {
    if (id in items) {
        return id;
    }

    return Object.keys(items).find(key =>
        items[key].some(item => item.id === id)
    );
};

type FindMoveInfo = (params: {
    id: string;
    activeContainer: string;
    overContainer: string;
    kanban: KanbanGroup[];
}) => {
    targetCard: RecastItem;
    targetGroup: KanbanGroup | null;
};

const findMoveInfo: FindMoveInfo = ({
    id,
    activeContainer,
    overContainer,
    kanban,
}) => {
    const activeGroup = kanban.find(group => group.id === activeContainer);
    const overGroup = kanban.find(group => group.id === overContainer);
    const activityCard = activeGroup.items.find(item => item.id === id);

    return {
        targetCard: activityCard.block,
        targetGroup: overGroup,
    };
};

/**
 * Find the sibling node after the dragging of the moved node ends
 * @param cards
 * @param currentCardId
 */
const findSibling = (
    cards: KanbanCard[],
    currentCardId: string
): [string, string, number] => {
    const index = cards.findIndex(card => card.id === currentCardId);

    return [cards[index - 1]?.id ?? null, cards[index + 1]?.id ?? null, index];
};

/**
 * Get card ids
 * @param data
 */
const pickIdFromCards = (data: KanbanCard[][]) => {
    return data.reduce((arr: string[], current) => {
        const ids = current.map(item => item.id);

        return [...arr, ...ids];
    }, []);
};

/**
 * Determine whether the current operation belongs to the addition, deletion, modification and inspection at the card/container level (distinguished from actions such as dragging, inputting card/container content, etc.)
 * @param prevContainerIds
 * @param prevCardIds
 * @param nextContainerIds
 * @param nextCardIds
 */
const shouldUpdate = (
    [prevContainerIds, prevCardIds]: [string[], string[]],
    [nextContainerIds, nextCardIds]: [string[], string[]]
) => {
    return !(
        /* Since the rendering of the container is based on the order, the order of the container changes and needs to be updated */ (
            isEqual(
                prevContainerIds,
                nextContainerIds
            ) /* add/remove container */ &&
            isEqual(prevCardIds.sort(), nextCardIds.sort())
        ) /* add/delete cards */
    );
};

export {
    transformKanban2DndFormat,
    findContainer,
    findSibling,
    pickIdFromCards,
    shouldUpdate,
    findMoveInfo,
};
