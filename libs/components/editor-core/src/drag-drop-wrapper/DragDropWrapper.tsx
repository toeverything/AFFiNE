import { AsyncBlock, BlockEditor } from '../editor';
import { ReactElement } from 'react';

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
    const handlerDragOver: React.DragEventHandler<HTMLDivElement> = event => {
        event.preventDefault();
        if (block.dom) {
            editor.getHooks().afterOnNodeDragOver(event, {
                blockId: block.id,
                dom: block.dom,
                rect: block.dom?.getBoundingClientRect(),
                type: block.type,
                properties: block.getProperties(),
            });
        }
    };
    return <div onDragOver={handlerDragOver}>{children}</div>;
}
