import { createContext, useContext } from 'react';
import type { BlockEditor, AsyncBlock } from './editor';
import { genErrorObj } from '@toeverything/utils';

const RootContext = createContext<{
    editor: BlockEditor;
    // TODO: Temporary fix, dependencies in the new architecture are bottom-up, editors do not need to be passed down from the top
    editorElement: () => JSX.Element;
}>(
    genErrorObj(
        'Failed to get context! The context only can use under the "render-root"'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any
);

export const EditorProvider = RootContext.Provider;

export const useEditor = () => {
    return useContext(RootContext);
};

/**
 * @deprecated
 */
export const BlockContext = createContext<AsyncBlock>(null as any);
