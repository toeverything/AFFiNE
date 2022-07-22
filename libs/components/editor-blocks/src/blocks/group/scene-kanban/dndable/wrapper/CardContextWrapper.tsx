import {
    verticalListSortingStrategy,
    SortableContext,
} from '@dnd-kit/sortable';
import { KanbanGroup } from '../../styles';
import type { ReactNode } from 'react';
import type { KanbanCard } from '@toeverything/components/editor-core';

interface Props {
    containerId: string;
    items: KanbanCard[];
    render: ({ items }: { items: KanbanCard[] }) => ReactNode;
}

export const CardContextWrapper = (props: Props) => {
    const { items, render } = props;

    return (
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
            <KanbanGroup>{render({ items })}</KanbanGroup>
        </SortableContext>
    );
};
