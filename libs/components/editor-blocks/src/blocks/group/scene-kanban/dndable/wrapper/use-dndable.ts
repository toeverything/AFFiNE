import { useCallback, useEffect, useRef, useState } from 'react';
import {
    closestCenter,
    getFirstCollision,
    pointerWithin,
    rectIntersection,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
    findContainer,
    findSibling,
    pickIdFromCards,
    shouldUpdate,
    findMoveInfo,
} from '../helper';
import type {
    CollisionDetection,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
} from '@dnd-kit/core';
import type { DndableItems, UseDndableRes } from '../type';
import { useKanban } from '@toeverything/components/editor-core';

export const useDndable = (
    dndableItems: DndableItems,
    dndableContainerIds: string[]
): UseDndableRes => {
    const { kanban, moveCard } = useKanban();
    const [items, setItems] = useState(dndableItems);
    const [containerIds, setContainerIds] = useState(dndableContainerIds);
    const [active, setActive] = useState(null);
    const lastOverId = useRef(null);
    const recentlyMovedToNewContainer = useRef(false);
    const activeId = active?.id;

    useEffect(() => {
        /*
         * Kanban operations are divided into: dragging, deleting, adding containers/cards, etc.;
         * 1. When any action is generated, the data source needs to be updated.
         * However, since the child components are rendered asynchronously, during this process, the payload will be continuously patched to the data source, causing useEffect to render endlessly.
         * (The main reason for the deformation of the card during the dragging process)
         * 2. In order to achieve better visual effects, use the hack scheme here to selectively update the data source:
         * 2.1 Maintain the state of the card in the state for drag and drop operations;
         * When a drag and drop behavior occurs: use moveTo to map the payload to the data source, but do not re-fetch the new data source
         * (If you use moveTo directly, the dragged cards and the exchanged cards will be re-rendered. This is because the current database read and write operations do not have a batch mechanism, and the vision is very strange)
         * 2.2 When deletion or addition occurs, the data source needs to be updated to display a new view;
         */
        const nextContainerIds = Object.keys(dndableItems);
        const prevCardIds = pickIdFromCards(Object.values(items));
        const nextCardIds = pickIdFromCards(Object.values(dndableItems));

        if (
            shouldUpdate(
                [containerIds, prevCardIds],
                [nextContainerIds, nextCardIds]
            )
        ) {
            setItems(dndableItems);
            setContainerIds(nextContainerIds);
        }
    }, [containerIds, dndableItems, items]);

    const collisionDetectionStrategy: CollisionDetection = useCallback(
        args => {
            if (activeId && activeId in items) {
                return closestCenter({
                    ...args,
                    droppableContainers: args.droppableContainers.filter(
                        container => container.id in items
                    ),
                });
            }

            // Start by finding any intersecting droppable
            const pointerIntersections = pointerWithin(args);
            const intersections =
                pointerIntersections.length > 0
                    ? // If there are droppables intersecting with the pointer, return those
                      pointerIntersections
                    : rectIntersection(args);
            let overId = getFirstCollision(intersections, 'id');

            if (overId != null) {
                if (overId in items) {
                    const containerItems = items[overId].filter(Boolean);

                    // If a container is matched and it contains items (columns 'A', 'B', 'C')
                    if (containerItems.length > 0) {
                        // Return the closest droppable within that container
                        overId = closestCenter({
                            ...args,
                            droppableContainers:
                                args.droppableContainers.filter(
                                    container =>
                                        container.id !== overId &&
                                        containerItems.some(
                                            item => item.id === container.id
                                        )
                                ),
                        })[0]?.id;
                    }
                }

                lastOverId.current = overId;

                return [{ id: overId }];
            }

            if (recentlyMovedToNewContainer.current) {
                lastOverId.current = activeId;
            }

            // If no droppable is matched, return the last match
            return lastOverId.current ? [{ id: lastOverId.current }] : [];
        },
        [activeId, items]
    );

    useEffect(() => {
        requestAnimationFrame(() => {
            recentlyMovedToNewContainer.current = false;
        });
    }, [items]);

    const onDragStart = ({ active }: DragStartEvent) => {
        setActive(active);
    };

    const onDragOver = ({ active, over }: DragOverEvent) => {
        const overId = over?.id as string;
        const activeId = active?.id as string;
        if (overId == null || activeId in items) {
            return;
        }

        const overContainer = findContainer(overId, items);
        const activeContainer = findContainer(activeId, items);

        if (!overContainer || !activeContainer) {
            return;
        }

        if (activeContainer !== overContainer) {
            setItems(items => {
                const activeItems = items[activeContainer];
                const overItems = items[overContainer];
                const overIndex = overItems.findIndex(
                    item => item.id === overId
                );
                const activeIndex = activeItems.findIndex(
                    item => item.id === activeId
                );
                const activeItem = activeItems.find(
                    item => item.id === activeId
                );

                let newIndex;

                if (overId in items) {
                    newIndex = overItems.length + 1;
                } else {
                    const isBelowOverItem =
                        over &&
                        active.rect.current.translated &&
                        active.rect.current.translated.top >
                            over.rect.top + over.rect.height;

                    const modifier = isBelowOverItem ? 1 : 0;

                    newIndex =
                        overIndex >= 0
                            ? overIndex + modifier
                            : overItems.length + 1;
                }

                recentlyMovedToNewContainer.current = true;

                const data = {
                    ...items,
                    [activeContainer]: items[activeContainer]
                        .filter(item => item.id !== active.id)
                        .filter(Boolean),
                    [overContainer]: [
                        ...items[overContainer].slice(0, newIndex),
                        items[activeContainer][activeIndex],
                        ...items[overContainer].slice(
                            newIndex,
                            items[overContainer].length
                        ),
                    ].filter(Boolean),
                };

                /*
                 * Linked with the following, if the cards in different Containers move horizontally (same level), onDragEnd.moveTo will not be triggered
                 * used here to handle the scene
                 * */
                const [beforeId, afterId] = findSibling(
                    data[overContainer],
                    activeId
                );

                activeItem?.moveTo(overContainer, beforeId, afterId);

                return data;
            });
        }
    };

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        const overId = over?.id as string;
        const activeId = active?.id as string;

        if (activeId in items && overId) {
            setContainerIds(containerIds => {
                const activeIndex = containerIds.indexOf(activeId);
                const overIndex = containerIds.indexOf(overId);

                if (activeIndex === -1 || overIndex === -1) {
                    return containerIds;
                }

                return arrayMove(containerIds, activeIndex, overIndex);
            });
        }

        const activeContainer = findContainer(activeId, items);

        if (!activeContainer) {
            setActive(null);
            return;
        }

        if (overId == null) {
            setActive(null);
            return;
        }

        const overContainer = findContainer(overId, items);

        if (overContainer) {
            const activeIndex = items[activeContainer].findIndex(
                item => item.id === activeId
            );
            const overIndex = items[overContainer].findIndex(
                item => item.id === overId
            );

            if (activeIndex === -1 || overIndex === -1) {
                return;
            }

            /* Between different containers, dragging at the same level will not go through this logic */
            if (activeIndex !== overIndex) {
                setItems(items => {
                    const data = {
                        ...items,
                        [overContainer]: arrayMove(
                            items[overContainer],
                            activeIndex,
                            overIndex
                        ).filter(Boolean),
                    };

                    const { targetCard } = findMoveInfo({
                        id: activeId,
                        activeContainer,
                        overContainer,
                        kanban,
                    });

                    moveCard(targetCard, null, overIndex);

                    return data;
                });
            }
        }

        setActive(null);
    };

    return [
        {
            active,
            containerIds,
            items,
            collisionDetectionStrategy,
        },
        {
            onDragStart,
            onDragOver,
            onDragEnd,
        },
    ];
};
