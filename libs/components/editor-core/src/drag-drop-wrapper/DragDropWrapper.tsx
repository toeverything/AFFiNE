import { AsyncBlock, BlockEditor } from '../editor';
import { ReactElement } from 'react';

export const dragDropWrapperClass = 'drag-drop-wrapper';

interface DragDropWrapperProps {
    editor: BlockEditor;
    block: AsyncBlock;
    children: ReactElement | null;
}

export function DragDropWrapper({
    children,
    editor,
    block,
}: DragDropWrapperProps) {
    const handler_drag_over: React.DragEventHandler<
        HTMLDivElement
    > = async event => {
        event.preventDefault();
        const rootDom = await editor.getBlockDomById(editor.getRootBlockId());
        if (block.dom && rootDom) {
            editor.getHooks().afterOnNodeDragOver(event, {
                blockId: block.id,
                dom: block.dom,
                rect: block.dom?.getBoundingClientRect(),
                rootRect: rootDom.getBoundingClientRect(),
                type: block.type,
                properties: block.getProperties(),
            });
        }
    };
    return (
        <div onDragOver={handler_drag_over} className={dragDropWrapperClass}>
            {children}
        </div>
    );
}
