import { Protocol } from '@toeverything/datasource/db-service';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useEditor } from '../contexts';
import { AsyncBlock } from '../editor';
import { useRecastBlock } from '../recast-block/Context';
import {
    useRecastBlockMeta,
    useSelectProperty,
} from '../recast-block/property';
import type { RecastItem } from '../recast-block/types';
import {
    KANBAN_PROPERTIES_KEY,
    PropertyType,
    RecastMetaProperty,
    RecastPropertyId,
} from '../recast-block/types';
import { supportChildren } from '../utils';
import {
    calcCardGroup,
    DEFAULT_GROUP_BY_PROPERTY,
    genDefaultGroup,
    getCardGroup,
    getGroupOptions,
    moveCardToAfter,
    moveCardToBefore,
    moveCardToGroup,
    unwrapGrid,
} from './atom';
import { KanbanContext } from './Context';
import { useKanbanGroup } from './group';
import { KanbanCard, KanbanGroup } from './types';

/**
 * Get the recast kanban groupBy property and set groupBy
 *
 * Only works with kanban view
 *
 * Get the multidimensional block kanban groupBy attribute
 * @public
 */
export const useRecastKanbanGroupBy = () => {
    const recastBlock = useRecastBlock();
    const { getProperty, getProperties } = useRecastBlockMeta();
    const kanbanProperties = recastBlock.getProperty(KANBAN_PROPERTIES_KEY);

    // TODO: remove filter
    // Add other type groupBy support
    const supportedGroupBy = getProperties().filter(
        prop =>
            prop.type === PropertyType.Select ||
            prop.type === PropertyType.MultiSelect
    );

    const setGroupBy = useCallback(
        async (id: RecastPropertyId) => {
            const ok = await recastBlock.setProperty(KANBAN_PROPERTIES_KEY, {
                ...kanbanProperties,
                groupBy: id,
            });
            if (!ok) {
                throw new Error('Failed to set groupBy');
            }
        },
        [recastBlock, kanbanProperties]
    );

    const groupById = kanbanProperties?.groupBy;
    // 1. groupBy is not set
    if (!groupById) {
        return {
            setGroupBy,
            supportedGroupBy,
        };
    }
    // 2. groupBy has been set, but not the detail found for the groupBy
    const groupByProperty = getProperty(groupById);
    if (!groupByProperty) {
        return {
            setGroupBy,
            supportedGroupBy,
        };
    }

    // 3. groupBy has been set and the detail found
    // but the type of the groupBy is not supported currently
    // TODO: support other property type
    if (
        groupByProperty.type !== PropertyType.Select &&
        groupByProperty.type !== PropertyType.MultiSelect
    ) {
        console.warn('Not support groupBy type', groupByProperty);

        return {
            setGroupBy,
            supportedGroupBy,
        };
    }
    // TODO: remove the type cast after support all property type
    const groupBy = groupByProperty as RecastMetaProperty;
    // TODO: end remove this

    return {
        groupBy,
        supportedGroupBy,
        setGroupBy,
    };
};

/**
 * Init kanban groupBy property if not set
 * Effect to set groupBy property
 */
export const useInitKanbanEffect = ():
    | readonly [loading: true, groupBy: null]
    | readonly [loading: false, groupBy: RecastMetaProperty] => {
    const { groupBy, setGroupBy, supportedGroupBy } = useRecastKanbanGroupBy();
    const { getProperties } = useRecastBlockMeta();
    const { createSelect } = useSelectProperty();

    useEffect(() => {
        const initKanban = async () => {
            // 1. has group by
            // do nothing
            if (groupBy) {
                return;
            }
            // 2. no group by, but has properties exist
            // set the first supported property as group by
            if (supportedGroupBy.length) {
                await setGroupBy(supportedGroupBy[0].id);
                return;
            }
            // 3. no group by, no properties
            // create a new property and set it as group by
            const prop = await createSelect(DEFAULT_GROUP_BY_PROPERTY);
            await setGroupBy(prop.id);
        };

        initKanban();
    }, [createSelect, getProperties, groupBy, setGroupBy, supportedGroupBy]);

    if (groupBy) {
        return [false, groupBy] as const;
    }
    return [true, null] as const;
};

/**
 * Get the recast kanban group.
 *
 * If not need kanban cards, use {@link useRecastKanbanGroupBy} instead.
 * @private
 */
export const useRecastKanban = () => {
    const recastBlock = useRecastBlock();
    const { groupBy, setGroupBy } = useRecastKanbanGroupBy();
    const { editor } = useEditor();
    const [kanban, setKanban] = useState<KanbanGroup[]>([]);

    useEffect(() => {
        const getGroupCards = async () => {
            if (!groupBy) {
                return;
            }

            const defaultGroup = genDefaultGroup(groupBy);
            const groupOptions = await getGroupOptions(groupBy, recastBlock);
            // Init group map
            const kanbanMap: Record<string, KanbanGroup> = Object.fromEntries([
                // Default group
                [defaultGroup.id, defaultGroup],
                // Groups from options
                ...groupOptions.map(option => [option.id, option]),
            ]);

            const children = (await recastBlock.children()).filter(
                Boolean
                // Safe type cast because of the filter guarantee
            ) as AsyncBlock[];

            const unwrapGridChildren = (
                await Promise.all(children.map(child => unwrapGrid(child)))
            ).flat();

            // Just for type cast
            // It's safe because of the implementation of RecastItem is AsyncBlock
            const recastItems = unwrapGridChildren as unknown as RecastItem[];

            recastItems.forEach(child => {
                const card: KanbanCard = {
                    id: child.id,
                    block: child,
                    moveTo: async (
                        id: KanbanGroup['id'],
                        beforeBlock: string | null,
                        afterBlock: string | null
                    ) => {
                        await moveCardToGroup(groupBy.id, child, kanbanMap[id]);
                        if (beforeBlock) {
                            const block = await editor.getBlockById(
                                beforeBlock
                            );
                            if (!block) {
                                throw new Error(
                                    `Failed to move card! card id ${id} not found`
                                );
                            }
                            await moveCardToAfter(
                                child,
                                block as unknown as RecastItem
                            );
                        } else if (afterBlock) {
                            const block = await editor.getBlockById(afterBlock);
                            if (!block) {
                                throw new Error(
                                    `Failed to move card! card id ${id} not found`
                                );
                            }
                            await moveCardToBefore(
                                child,
                                block as unknown as RecastItem
                            );
                        }
                    },
                };
                const group = calcCardGroup(
                    child,
                    groupBy,
                    groupOptions,
                    defaultGroup
                );
                kanbanMap[group.id].items.push(card);
            });
            setKanban(Object.values(kanbanMap));
        };
        getGroupCards();
        // Workaround: Add the extra `recastBlock.lastUpdated` as dependencies for the `recastBlock` can not update reference
    }, [editor, groupBy, recastBlock, recastBlock.lastUpdated]);

    return {
        recastBlock,
        kanban,
        setGroupBy,
    };
};

/**
 * Get the kanban API.
 *
 * Please make sure the {@link KanbanProvider} is set before use.
 *
 * @example
 * ```ts
 * const { kanban, groupBy, setGroupBy, addGroup } = useKanban();
 *
 * await addGroup('new group');
 * await moveCard(card, newGroup, 0);
 * ```
 */
export const useKanban = () => {
    const { groupBy, kanban, recastBlock } = useContext(KanbanContext);
    const groupOp = useKanbanGroup(groupBy);
    const { editor } = useEditor();

    /**
     * Move a card to a group.
     */
    const moveCard = useCallback(
        async (
            targetCard: RecastItem,
            targetGroup: KanbanGroup | null,
            idx?: number
        ) => {
            targetCard = targetCard as unknown as RecastItem;
            const [nowGroup] = getCardGroup(targetCard, kanban);
            // 1. Move to the target group
            if (!targetGroup) {
                // 1.1 Target group is not specified, just set the nowGroup as the targetGroup
                targetGroup = nowGroup;
            }
            if (nowGroup.id !== targetGroup.id) {
                // 1.2 Move to the target group
                await moveCardToGroup(groupBy.id, targetCard, targetGroup);
            }

            // 2. Reorder the card
            if (!targetGroup.items.length) {
                // 2.1 If target group is empty, no need to reorder
                return;
            }
            if (typeof idx !== 'number') {
                // 2.2 idx is not specified, do nothing
                return;
            }

            if (idx === 0) {
                await moveCardToBefore(targetCard, nowGroup.items[0].block);
                return;
            }
            if (idx > nowGroup.items.length) {
                idx = nowGroup.items.length;
            }
            const previousBlock = nowGroup.items[idx - 1].block;
            await moveCardToAfter(targetCard, previousBlock);
        },
        [groupBy, kanban]
    );

    const addCard = useCallback(
        async (group: KanbanGroup) => {
            const newBlock = await editor.createBlock(Protocol.Block.Type.text);
            if (!newBlock) {
                throw new Error('Failed to create new block!');
            }
            recastBlock.append(newBlock);
            const newCard = newBlock as unknown as RecastItem;
            await moveCardToGroup(groupBy.id, newCard, group);
        },
        [editor, groupBy.id, recastBlock]
    );

    const addSubItem = useCallback(
        async (card: RecastItem) => {
            if (!supportChildren(card)) {
                throw new Error('This card does not support children!');
            }

            const newBlock = await editor.createBlock(Protocol.Block.Type.text);
            if (!newBlock) {
                throw new Error('Failed to create new block!');
            }
            card.append(newBlock);
            editor.selectionManager.activeNodeByNodeId(newBlock.id);
        },
        [editor]
    );

    return { kanban, groupBy, moveCard, addCard, addSubItem, ...groupOp };
};
