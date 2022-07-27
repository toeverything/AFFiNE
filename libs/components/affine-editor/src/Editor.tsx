import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import {
    RenderRoot,
    RenderBlock,
    type BlockEditor,
} from '@toeverything/components/editor-core';
import { useCurrentEditors } from '@toeverything/datasource/state';

import { createEditor } from './create-editor';

interface AffineEditorProps {
    workspace: string;
    rootBlockId: string;
    /**
     * Whether to show the visual blank at the bottom of the article
     */
    scrollBlank?: boolean;

    isWhiteboard?: boolean;
}

function useConstant<T>(init: () => T): T {
    const ref = useRef<T>(null);
    ref.current ??= init();

    return ref.current;
}

export const AffineEditor = forwardRef<BlockEditor, AffineEditorProps>(
    ({ workspace, rootBlockId, scrollBlank = true, isWhiteboard }, ref) => {
        const { setCurrentEditors } = useCurrentEditors();
        const editor = useConstant(() => {
            const editor = createEditor(workspace, isWhiteboard);

            // @ts-ignore
            globalThis.virgo = editor;
            return editor;
        });

        useImperativeHandle(ref, () => editor);

        useEffect(() => {
            if (rootBlockId) {
                editor.setRootBlockId(rootBlockId);
            } else {
                console.error('rootBlockId for page is required. ');
            }
        }, [editor, rootBlockId]);

        useEffect(() => {
            if (!rootBlockId) return;
            setCurrentEditors(prev => ({ ...prev, [rootBlockId]: editor }));
        }, [editor, rootBlockId, setCurrentEditors]);

        return (
            <RenderRoot
                editor={editor}
                editorElement={AffineEditor as any}
                scrollBlank={scrollBlank}
            >
                <RenderBlock blockId={rootBlockId} />
            </RenderRoot>
        );
    }
);
