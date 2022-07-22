import { useSortable, defaultAnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Container } from '../component/Container';
import type { ReactNode } from 'react';
import type { AnimateLayoutChanges } from '@dnd-kit/sortable';
import type { KanbanCard } from '@toeverything/components/editor-core';

const animateLayoutChanges: AnimateLayoutChanges = args =>
    defaultAnimateLayoutChanges({ ...args, wasDragging: true });

interface Props {
    children: ReactNode;
    disabled?: boolean;
    id: string;
    items: KanbanCard[];
}

export function DroppableContainer({
    children,
    disabled,
    id,
    items,
    ...props
}: Props) {
    const { isDragging, setNodeRef, transition, transform } = useSortable({
        id,
        data: {
            type: 'container',
            children: items,
        },
        animateLayoutChanges,
    });

    return (
        <Container
            ref={disabled ? undefined : setNodeRef}
            style={{
                transition,
                transform: CSS.Translate.toString(transform),
                ...(isDragging && { opacity: 0.5 }),
            }}
            {...props}
        >
            {children}
        </Container>
    );
}
