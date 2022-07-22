import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CardItemWrapper } from './CardItemWrapper';
import type { ReactNode } from 'react';
import type { Active } from '@dnd-kit/core';
import type { KanbanCard } from '@toeverything/components/editor-core';

interface Props {
    disabled?: boolean;
    index?: number;
    item: KanbanCard;
    children: ReactNode;
    active?: boolean;
}

function useMountStatus() {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        const timeout = setTimeout(() => setIsMounted(true), 500);

        return () => clearTimeout(timeout);
    }, []);

    return isMounted;
}

const CardItemPanelWrapper = ({
    disabled,
    index,
    item,
    active,
    children,
}: Props) => {
    const { setNodeRef, listeners, isDragging, transform, transition } =
        useSortable({
            id: item.id,
        });

    const mounted = useMountStatus();
    const mountedWhileDragging = isDragging && !mounted;

    return (
        <CardItemWrapper
            ref={disabled ? undefined : setNodeRef}
            dragging={isDragging}
            index={index}
            style={{ opacity: active ? 0.5 : undefined }}
            transition={transition}
            transform={transform}
            fadeIn={mountedWhileDragging}
            listeners={listeners}
            card={children}
        />
    );
};

export { CardItemPanelWrapper };
