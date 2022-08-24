import type { BlockEditor } from '@toeverything/components/editor-core';
import type { ReactNode } from 'react';

export type TOCType = {
    id: string;
    type: string;
    text: string;
};

export type ListenerMap = Map<string, () => void>;

export interface TOCProps {
    children: ReactNode;
    editor?: BlockEditor;
}
