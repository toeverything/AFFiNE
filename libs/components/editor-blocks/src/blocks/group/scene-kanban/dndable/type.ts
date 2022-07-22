import type { KanbanCard } from '@toeverything/components/editor-core';
import type {
    CollisionDetection,
    DragStartEvent,
    DragEndEvent,
    DragOverEvent,
    Active,
} from '@dnd-kit/core';

export type DndableItems = Record<string, KanbanCard[]>;

export type UseDndableRes = [
    {
        active: Active;
        containerIds: string[];
        items: DndableItems;
        collisionDetectionStrategy: CollisionDetection;
    },
    {
        onDragStart: ({ active }: DragStartEvent) => void;
        onDragOver: ({ active, over }: DragOverEvent) => void;
        onDragEnd: ({ active, over }: DragEndEvent) => void;
    }
];

export type Transform = {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
};
