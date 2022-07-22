import { createPortal } from 'react-dom';
import { defaultDropAnimationSideEffects, DragOverlay } from '@dnd-kit/core';
import { renderContainerDragOverlay } from './renderContainerDragOverlay';
import { renderSortableItemDragOverlay } from './renderSortableItemDragOverlay';
import type { DndableItems } from '../type';

interface DragOverlayPortal {
    activeId: string;
    containerIds: string[];
    items: DndableItems;
}

const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: {
                opacity: '0.5',
            },
        },
    }),
};

const DragOverlayPortal = ({
    activeId,
    containerIds,
    items,
}: DragOverlayPortal) => {
    return createPortal(
        <DragOverlay adjustScale={false} dropAnimation={dropAnimation}>
            {activeId
                ? containerIds.includes(activeId)
                    ? renderContainerDragOverlay({
                          containerId: activeId,
                          items,
                      })
                    : renderSortableItemDragOverlay({ activeId, items })
                : null}
        </DragOverlay>,
        document.body
    );
};

export { DragOverlayPortal };
