import { Protocol } from '@toeverything/datasource/db-service';
import { AsyncBlock } from '../editor';
import { getRecastItemValue } from '../recast-block/property';
import type { RecastBlock, RecastItem } from '../recast-block/types';
import {
    PropertyType,
    RecastBlockValue,
    RecastMetaProperty,
} from '../recast-block/types';
import type { DefaultGroup, KanbanGroup } from './types';
import { DEFAULT_GROUP_ID } from './types';
import {
    generateInitialOptions,
    generateRandomFieldName,
    getPendantIconsConfigByName,
    getPendantController,
} from '../block-pendant/utils';
import { SelectOption } from '../recast-block';

/**
 * - If the `groupBy` is `SelectProperty` or `MultiSelectProperty`, return `(Multi)SelectProperty.options`.
 * - If the `groupBy` is `TextProperty` or `DateProperty`, return all values of the recastBlock's children
 */
export const getGroupOptions = async (
    groupBy: RecastMetaProperty,
    recastBlock: RecastBlock
): Promise<KanbanGroup[]> => {
    if (!groupBy) {
        return [];
    }
    switch (groupBy.type) {
        case PropertyType.Status:
        case PropertyType.Select:
        case PropertyType.MultiSelect: {
            return groupBy.options.map(option => ({
                ...option,
                type: groupBy.type,
                items: [],
            }));
        }
        case PropertyType.Text: {
            // const children = await recastBlock.children();
            // TODO: support group by text, need group children value
            return []; // WIP! Just a placeholder
        }
        default: {
            throw new Error(
                // Safe cast for future compatible
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                `Not support group by type "${(groupBy as any).type}"`
            );
        }
    }
};

const isValueBelongOption = (
    propertyValue: RecastBlockValue,
    option: KanbanGroup
) => {
    switch (propertyValue.type) {
        case PropertyType.Select: {
            return propertyValue.value === option.id;
        }
        case PropertyType.MultiSelect: {
            return propertyValue.value.some(i => i === option.id);
        }
        case PropertyType.Status: {
            return propertyValue.value === option.id;
        }
        // case PropertyType.Text: {
        // TOTODO:DO support this type
        // }
        default: {
            console.error(propertyValue, option);
            throw new Error('Not support group by type');
        }
    }
};

/**
 * Calculate the group that the card belongs to
 */
export const calcCardGroup = (
    card: RecastItem,
    groupBy: RecastMetaProperty,
    groupOptions: KanbanGroup[],
    defaultGroup: KanbanGroup
) => {
    const { getValue } = getRecastItemValue(card);
    const propertyValue = getValue(groupBy.id);
    if (!propertyValue || propertyValue.type !== groupBy.type) {
        // No properties, maybe not have be initialized
        // Belong to default group
        return defaultGroup;
    }
    const target = groupOptions.find(option =>
        isValueBelongOption(propertyValue, option)
    );
    if (target) {
        return target;
    }
    // Belong to default group
    return defaultGroup;
};

/**
 * Set group value for the card block
 */
export const moveCardToGroup = async ({
    groupBy,
    cardBlock,
    group,
    recastBlock,
}: {
    groupBy: RecastMetaProperty;
    cardBlock: RecastItem;
    group: KanbanGroup;
    recastBlock: RecastBlock;
}) => {
    const { setPendant, removePendant } = getPendantController(
        recastBlock,
        cardBlock
    );
    let success = false;
    if (group.id === DEFAULT_GROUP_ID) {
        success = await removePendant(groupBy);
        return false;
    }

    switch (group.type) {
        case PropertyType.Select: {
            success = await setPendant(groupBy, group.id);
            break;
        }
        case PropertyType.Status: {
            success = await setPendant(groupBy, group.id);
            break;
        }
        case PropertyType.MultiSelect: {
            success = await setPendant(groupBy, [group.id]);
            break;
        }
        case PropertyType.Text: {
            success = await setPendant(groupBy, group.id);
            break;
        }
        default:
            console.error('group', group, 'block', cardBlock);
            throw new Error('Not support move card to group');
    }
    return success;
};

export const moveCardToBefore = async (
    targetBlock: RecastItem,
    nextBlock: RecastItem
) => {
    if (targetBlock.id === nextBlock.id) return;
    await targetBlock.remove();
    await nextBlock.before(targetBlock as unknown as AsyncBlock);
};

export const moveCardToAfter = async (
    targetBlock: RecastItem,
    previousBlock: RecastItem
) => {
    if (targetBlock.id === previousBlock.id) return;
    await targetBlock.remove();
    await previousBlock.after(targetBlock as unknown as AsyncBlock);
};

/**
 * Similar to {@link calcCardGroup}, but only find card from the existed group
 */
export const getCardGroup = (card: RecastItem, kanban: KanbanGroup[]) => {
    for (let i = 0; i < kanban.length; i++) {
        const kanbanGroup = kanban[i];
        for (let j = 0; j < kanbanGroup.items.length; j++) {
            const kanbanCard = kanbanGroup.items[j];
            if (kanbanCard.id === card.id) {
                return [kanbanGroup, j] as const;
            }
        }
    }

    console.error('kanban', kanban, 'card', card);
    throw new Error('Failed to find the group containing the card!');
};

/**
 * Is the group is the default group.
 *
 * - the default group has unique id
 * - the default group can not be renamed/deleted
 */
export const checkIsDefaultGroup = (
    group: KanbanGroup
): group is DefaultGroup => group.id === DEFAULT_GROUP_ID;

export const genDefaultGroup = (groupBy: RecastMetaProperty): DefaultGroup => ({
    id: DEFAULT_GROUP_ID,
    type: DEFAULT_GROUP_ID,
    name: `No ${groupBy.name}`,
    color: '#4324B9',
    background: '#E3DEFF',
    items: [],
});

export const generateDefaultGroupByProperty = (): {
    name: string;
    options: Omit<SelectOption, 'id'>[];
    type: PropertyType.Status;
} => ({
    name: generateRandomFieldName(PropertyType.Status),
    type: PropertyType.Status,
    options: generateInitialOptions(
        PropertyType.Status,
        getPendantIconsConfigByName(PropertyType.Status)
    ),
});

/**
 * Unwrap blocks from the grid recursively.
 *
 * If the node is not a grid node, return as is and wrap with a array
 */
export const unwrapGrid = async (node: AsyncBlock): Promise<AsyncBlock[]> => {
    if (
        node.type === Protocol.Block.Type.grid ||
        node.type === Protocol.Block.Type.gridItem
    ) {
        const children = await node.children();
        return (
            await Promise.all(children.map(child => unwrapGrid(child)))
        ).flat();
    }

    return [node];
};
