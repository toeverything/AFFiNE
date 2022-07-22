import type { MutableRefObject } from 'react';

export type TreeItem = {
    /** page id */
    id: string;
    /** page title */
    title?: string;
    /** sub pages */
    children: TreeItem[];
    collapsed?: boolean;
};

export type TreeItems = TreeItem[];

export type FlattenedItem = TreeItem & {
    index: number;
    /** parent page id */
    parentId: string | null;
    depth: number;
};

export type SensorContext = MutableRefObject<{
    items: FlattenedItem[];
    offset: number;
}>;
