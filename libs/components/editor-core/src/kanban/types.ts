import type { RecastItem } from '../recast-block/types';
import { PropertyType, SelectOption } from '../recast-block/types';

export const DEFAULT_GROUP_ID = '__EMPTY_GROUP';
type DefaultGroupId = typeof DEFAULT_GROUP_ID;

/**
 * Block id
 */
type CardId = string;

export type KanbanCard = {
    id: CardId;
    block: RecastItem;
    /**
     * Move the item to other group. (Set property to the block)
     * @deprecated Use {@link useKanban().moveCard} instead
     */
    moveTo: (
        id: KanbanGroup['id'],
        beforeBlockId: string | null,
        afterBlockId: string | null
    ) => Promise<void>;
    // moveToBefore: (id: CardId) => Promise<boolean>;
    // moveToAfter: (id: CardId) => Promise<boolean>;
};

type KanbanGroupBase = {
    /**
     * Group name
     */
    name: string;
    /**
     * Block id list
     */
    items: KanbanCard[];
};

export type DefaultGroup = KanbanGroupBase & {
    type: DefaultGroupId;
    id: DefaultGroupId;
    name: `No ${string}`;
    color?: SelectOption['color'];
    background?: SelectOption['background'];
};

type SelectGroup = KanbanGroupBase &
    SelectOption & {
        type:
            | PropertyType.Select
            | PropertyType.MultiSelect
            | PropertyType.Status;
    };

type TextGroup = KanbanGroupBase & {
    type: PropertyType.Text;
    id: string;
};

export type KanbanGroup = DefaultGroup | SelectGroup | TextGroup;
