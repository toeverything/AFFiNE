import type { DndableItems } from './dndable/type';

export interface CardContainerProps {
    containerIds: string[];
    items: DndableItems;
    isSortingContainer?: boolean;
    activeId?: string;
}
