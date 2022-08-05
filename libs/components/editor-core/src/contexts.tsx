import { createContext, useContext } from 'react';
import type { BlockEditor, AsyncBlock } from './editor';
import type { Column } from '@toeverything/datasource/db-service';
import { genErrorObj } from '@toeverything/utils';

export const RootContext = createContext<{
    editor: BlockEditor;
    // TODO: Temporary fix, dependencies in the new architecture are bottom-up, editors do not need to be passed down from the top
    editorElement: () => JSX.Element;
}>(
    genErrorObj(
        'Failed to get context! The context only can use under the "render-root"'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any
);

export const useEditor = () => {
    return useContext(RootContext);
};

/**
 * @deprecated
 */
export const BlockContext = createContext<AsyncBlock>(null as any);

/**
 * Context of column information
 *
 * @deprecated
 */
export const ColumnsContext = createContext<{
    fromId: string;
    columns: Column[];
}>({
    fromId: '',
    columns: [],
});
