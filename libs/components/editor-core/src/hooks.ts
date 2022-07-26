import {
    AsyncBlock,
    BlockEditor,
    SelectEventTypes,
    SelectionInfo,
    SelectionSettingsMap,
} from './editor';
import { noop, Point } from '@toeverything/utils';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { RootContext } from './contexts';

function useRequestReRender() {
    const [, setUpdateCounter] = useState(0);
    const animationFrameRef = useRef<number | null>(null);

    const requestReRender = useCallback((immediate = false) => {
        if (animationFrameRef.current && !immediate) {
            return;
        }

        if (!immediate) {
            animationFrameRef.current = requestAnimationFrame(() => {
                setUpdateCounter(state => state + 1);
                animationFrameRef.current = null;
            });
            return;
        }

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        setUpdateCounter(state => state + 1);
    }, []);

    useEffect(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
    });

    useEffect(
        () => () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        },
        []
    );

    return requestReRender;
}

export const useBlock = (blockId: string) => {
    const [block, setBlock] = useState<AsyncBlock>();
    const requestReRender = useRequestReRender();
    const { editor } = useContext(RootContext);
    useEffect(() => {
        if (!blockId) {
            return undefined;
        }
        let valid = true;
        let offUpdate = noop;
        editor.getBlockById(blockId).then(node => {
            if (!valid) {
                return;
            }
            if (!node) {
                console.warn('Failed to get block by id', blockId);
                return undefined;
            }
            setBlock(node);
            offUpdate = node.onUpdate(() => {
                requestReRender();
            });
        });

        return () => {
            valid = false;
            offUpdate();
        };
    }, [blockId, editor, requestReRender]);

    return { block };
};

/**
 *
 * hooks run when block node selected as a block
 * @export
 */
export const useOnSelect = (
    blockId: string,
    cb: (isSelect: boolean) => void
) => {
    const { editor } = useContext(RootContext);
    useEffect(() => {
        editor.selectionManager.observe(blockId, SelectEventTypes.onSelect, cb);
        return () => {
            editor.selectionManager.unobserve(
                blockId,
                SelectEventTypes.onSelect,
                cb
            );
        };
    }, [cb, blockId, editor]);
};

/**
 *
 * hooks run when block was set focused by selection manager
 * @export
 */
export const useOnSelectActive = (
    blockId: string,
    cb: (position: Point | undefined) => void
) => {
    const { editor } = useContext(RootContext);
    useEffect(() => {
        editor.selectionManager.observe(blockId, SelectEventTypes.active, cb);
        return () => {
            editor.selectionManager.unobserve(
                blockId,
                SelectEventTypes.active,
                cb
            );
        };
    }, [cb, blockId, editor]);
};

/**
 *
 * hooks run when block was set range by selection manager
 * @export
 */
export const useOnSelectSetSelection = <T extends keyof SelectionSettingsMap>(
    blockId: string,
    cb: (args: SelectionSettingsMap[T]) => void
) => {
    const { editor } = useContext(RootContext);
    useEffect(() => {
        editor.selectionManager.observe(
            blockId,
            SelectEventTypes.setSelection,
            cb
        );
        return () => {
            editor.selectionManager.unobserve(
                blockId,
                SelectEventTypes.setSelection,
                cb
            );
        };
    }, [cb, blockId, editor]);
};

/**
 *
 * hooks run when selection type or range is changed
 * @export
 */
export const useOnSelectChange = (cb: (info: SelectionInfo) => void) => {
    const { editor } = useContext(RootContext);
    useEffect(() => {
        editor.selectionManager.onSelectionChange(cb);
        return () => {
            editor.selectionManager.unBindSelectionChange(cb);
        };
    }, [editor, cb]);
};

/**
 *
 * hooks run when select end (based on mouse up)
 * @export
 */
export const useOnSelectEnd = (cb: (info: SelectionInfo) => void) => {
    const { editor } = useContext(RootContext);
    useEffect(() => {
        editor.selectionManager.onSelectEnd(cb);
        return () => {
            editor.selectionManager.onSelectEnd(cb);
        };
    }, [editor, cb]);
};

/**
 *
 * hooks run when select range start with the block node
 * @export
 */
export const useOnSelectStartWith = (
    blockId: string,
    cb: (args: MouseEvent) => void
) => {
    const { editor } = useContext(RootContext);
    useEffect(() => {
        editor.mouseManager.onSelectStartWith(blockId, cb);
        return () => {
            editor.mouseManager.offSelectStartWith(blockId, cb);
        };
    }, [editor, cb, blockId]);
};

/**
 *
 * hooks run when drag state change
 * @export
 */
export const useIsOnDrag = (editor: BlockEditor) => {
    const editorInstance = editor;
    const [isOnDrag, setIsOnDrag] = useState(false);
    useEffect(() => {
        const callback = (isDrag: boolean) => setIsOnDrag(isDrag);
        editorInstance.dragDropManager.onDragStateChange(callback);
        return () => {
            editorInstance.dragDropManager.offDragStateChange(callback);
        };
    }, [editorInstance]);
    return isOnDrag;
};
