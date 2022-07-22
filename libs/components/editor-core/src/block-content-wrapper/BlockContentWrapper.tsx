import { AsyncBlock, BlockEditor } from '../editor';
import type { FC, ReactElement } from 'react';
import { BlockPendantProvider } from '../block-pendant';
import { DragDropWrapper } from '../drag-drop-wrapper';

type BlockContentWrapperProps = {
    block: AsyncBlock;
    editor: BlockEditor;
    children: ReactElement | null;
};

export const WrapperWithPendantAndDragDrop: FC<BlockContentWrapperProps> =
    function ({ block, children, editor }) {
        return (
            <DragDropWrapper block={block} editor={editor}>
                <BlockPendantProvider block={block}>
                    {children}
                </BlockPendantProvider>
            </DragDropWrapper>
        );
    };
