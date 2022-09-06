import { genErrorObj } from '@toeverything/utils';
import { createContext, PropsWithChildren, useContext } from 'react';
import type { AsyncBlock, BlockEditor } from './editor';

type EditorProps = {
    editor: BlockEditor;
    // TODO: Temporary fix, dependencies in the new architecture are bottom-up, editors do not need to be passed down from the top
    editorElement: () => JSX.Element;
};

const EditorContext = createContext<EditorProps>(
    genErrorObj(
        'Failed to get EditorContext! The context only can use under the "render-root"'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any
);

export const useEditor = () => {
    return useContext(EditorContext);
};

export const EditorProvider = ({
    editor,
    editorElement,
    children,
}: PropsWithChildren<EditorProps>) => {
    return (
        <EditorContext.Provider value={{ editor, editorElement }}>
            {children}
        </EditorContext.Provider>
    );
};

/**
 * @deprecated
 */
export const BlockContext = createContext<AsyncBlock>(null as any);
