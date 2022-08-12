import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import {
    RenderBlock,
    RenderRoot,
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

    scrollContainer?: HTMLElement;
    scrollController?: {
        lockScroll: () => void;
        unLockScroll: () => void;
    };
}

function _useConstantWithDispose(
    workspace: string,
    rootBlockId: string,
    isWhiteboard: boolean
) {
    const ref = useRef<{ data: BlockEditor; onInit: boolean }>(null);
    const { setCurrentEditors } = useCurrentEditors();
    ref.current ??= {
        data: createEditor(workspace, rootBlockId, isWhiteboard),
        onInit: true,
    };

    useEffect(() => {
        if (ref.current.onInit) {
            ref.current.onInit = false;
        } else {
            ref.current.data = createEditor(
                workspace,
                rootBlockId,
                isWhiteboard
            );
        }
        setCurrentEditors(prev => ({
            ...prev,
            [rootBlockId]: ref.current.data,
        }));
        return () => ref.current.data.dispose();
    }, [workspace, rootBlockId, isWhiteboard, setCurrentEditors]);

    return ref.current.data;
}

export const AffineEditor = forwardRef<BlockEditor, AffineEditorProps>(
    (
        {
            workspace,
            rootBlockId,
            scrollBlank = true,
            isWhiteboard,
            scrollController,
            scrollContainer,
        },
        ref
    ) => {
        const editor = _useConstantWithDispose(
            workspace,
            rootBlockId,
            isWhiteboard
        );

        useEffect(() => {
            if (scrollContainer) {
                editor.scrollManager.scrollContainer = scrollContainer;
            }
            if (scrollController) {
                editor.scrollManager.scrollController = scrollController;
            }
        }, [editor, scrollContainer, scrollController]);

        useImperativeHandle(ref, () => editor);

        return (
            <RenderRoot
                editor={editor}
                editorElement={AffineEditor as any}
                scrollBlank={scrollBlank}
            >
                <RenderBlock blockId={editor.getRootBlockId()} />
            </RenderRoot>
        );
    }
);
