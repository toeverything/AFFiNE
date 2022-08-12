import { CSSProperties } from 'react';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { iOS } from '../utils';
import { TreeItem, TreeItemProps } from './TreeItem';

type DndTreeItemProps = TreeItemProps & {
    id: string;
};

export function DndTreeItem({ id, depth, ...props }: DndTreeItemProps) {
    const {
        attributes,
        isDragging,
        isSorting,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id });

    const style: CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
    };

    return (
        <TreeItem
            ref={setNodeRef}
            pageId={id}
            style={style}
            depth={depth}
            ghost={isDragging}
            disableSelection={iOS}
            disableInteraction={isSorting}
            handleProps={{
                ...attributes,
                ...listeners,
            }}
            {...props}
        />
    );
}
