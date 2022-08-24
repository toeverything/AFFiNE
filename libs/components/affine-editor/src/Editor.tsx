import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import {
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

    isEdgeless?: boolean;

    scrollContainer?: HTMLElement;
    scrollController?: {
        lockScroll: () => void;
        unLockScroll: () => void;
    };
}

function _useConstantWithDispose(
    workspace: string,
    rootBlockId: string,
    isEdgeless: boolean
) {
    const ref = useRef<{ data: BlockEditor; onInit: boolean }>(null);
    const { setCurrentEditors } = useCurrentEditors();
    ref.current ??= {
        data: createEditor(workspace, rootBlockId, isEdgeless),
        onInit: true,
    };

    useEffect(() => {
        if (ref.current.onInit) {
            ref.current.onInit = false;
        } else {
            ref.current.data = createEditor(workspace, rootBlockId, isEdgeless);
        }
        setCurrentEditors(prev => ({
            ...prev,
            [rootBlockId]: ref.current.data,
        }));
        return () => ref.current.data.dispose();
    }, [workspace, rootBlockId, isEdgeless, setCurrentEditors]);

    return ref.current.data;
}

export const AffineEditor = forwardRef<BlockEditor, AffineEditorProps>(
    (
        {
            workspace,
            rootBlockId,
            scrollBlank = true,
            isEdgeless,
            scrollController,
            scrollContainer,
        },
        ref
    ) => {
        const editor = _useConstantWithDispose(
            workspace,
            rootBlockId,
            isEdgeless
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
            />
        );
    }
);
