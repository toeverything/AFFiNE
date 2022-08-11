import React, { useMemo } from 'react';

import {
    DndContext,
    DragOverlay,
    DropAnimation,
    MeasuringStrategy,
    PointerSensor,
    defaultDropAnimation,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { DndTreeItem } from './tree-item';
import type { TreeItems } from './types';
import { usePageTree } from './use-page-tree';
import { getChildCount } from './utils';

const measuring = {
    droppable: {
        strategy: MeasuringStrategy.Always,
    },
};

const dropAnimation: DropAnimation = {
    ...defaultDropAnimation,
    // dragSourceOpacity: 0.5,
};

export type DndTreeProps = {
    defaultItems?: TreeItems;
    indentationWidth?: number;
    collapsible?: boolean;
    removable?: boolean;
    showDragIndicator?: boolean;
};

/**
 * Currently does not support drag and drop using the keyboard.
 */
export function DndTree(props: DndTreeProps) {
    const {
        indentationWidth = 20,
        collapsible,
        removable,
        showDragIndicator,
    } = props;

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    const {
        items,
        activeId,
        flattenedItems,
        projected,
        handleDragStart,
        handleDragMove,
        handleDragOver,
        handleDragEnd,
        handleDragCancel,
        handleRemove,
        handleCollapse,
    } = usePageTree(props);

    const sortedIds = useMemo(
        () => flattenedItems.map(({ id }) => id),
        [flattenedItems]
    );

    const activeItem = useMemo(
        () =>
            activeId ? flattenedItems.find(({ id }) => id === activeId) : null,
        [activeId, flattenedItems]
    );

    return (
        <DndContext
            sensors={sensors}
            measuring={measuring}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <SortableContext
                items={sortedIds}
                strategy={verticalListSortingStrategy}
            >
                {/* <button onClick={() => handleAdd()}> add top node</button> */}
                {flattenedItems.map(
                    ({ id, title, children, collapsed, depth }) => {
                        return (
                            <DndTreeItem
                                key={id}
                                id={id}
                                // value={id}
                                value={title}
                                collapsed={Boolean(
                                    collapsed && children.length
                                )}
                                depth={
                                    id === activeId && projected
                                        ? projected.depth
                                        : depth
                                }
                                indentationWidth={indentationWidth}
                                indicator={showDragIndicator}
                                childCount={children.length}
                                onCollapse={
                                    collapsible && children.length
                                        ? () => handleCollapse(id)
                                        : undefined
                                }
                                onRemove={
                                    removable
                                        ? () => handleRemove(id)
                                        : undefined
                                }
                            />
                        );
                    }
                )}
                <DragOverlay
                    dropAnimation={dropAnimation}
                    style={{ marginTop: '-65px' }}
                >
                    {activeId && activeItem ? (
                        <DndTreeItem
                            id={activeId}
                            // value={activeId}
                            value={activeItem.title}
                            depth={activeItem.depth}
                            clone={true}
                            childCount={getChildCount(items, activeId) + 1}
                            indentationWidth={indentationWidth}
                        />
                    ) : null}
                </DragOverlay>
            </SortableContext>
        </DndContext>
    );
}
