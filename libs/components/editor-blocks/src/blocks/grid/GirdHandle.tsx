import type { FC } from 'react';
import { useState } from 'react';
import { styled } from '@toeverything/components/ui';
import { BlockEditor } from '@toeverything/framework/virgo';

type GridHandleProps = {
    editor: BlockEditor;
    onDrag?: (e: MouseEvent) => void;
    onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
    blockId: string;
    enabledAddItem: boolean;
    draggable: boolean;
};

export const GridHandle: FC<GridHandleProps> = function ({
    blockId,
    editor,
    enabledAddItem,
    onDrag,
    onMouseDown,
    draggable,
}) {
    const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
    const handleMouseDown: React.MouseEventHandler<HTMLDivElement> = e => {
        if (draggable) {
            const cb = (e: MouseEvent) => {
                onDrag && onDrag(e);
            };
            onMouseDown && onMouseDown(e);
            setIsMouseDown(true);
            editor.mouseManager.onMouseMove(cb);
            editor.mouseManager.onMouseupEventOnce(() => {
                setIsMouseDown(false);
                editor.mouseManager.offMouseMove(cb);
            });
        }
    };
    const handleCreateGridItem = async () => {
        const [, textBlock] =
            await editor.commands.blockCommands.createGridItem(blockId);
        if (textBlock) {
            editor.selectionManager.setActivatedNodeId(textBlock.id);
        }
    };
    return (
        <GridHandleContainer
            style={
                isMouseDown
                    ? {
                          backgroundColor: '#3E6FDB',
                      }
                    : {}
            }
            onMouseDown={handleMouseDown}
        >
            {enabledAddItem ? (
                <AddGridHandle
                    onClick={handleCreateGridItem}
                    className="grid-add-handle"
                >
                    +
                </AddGridHandle>
            ) : null}
        </GridHandleContainer>
    );
};

const GridHandleContainer = styled('div')(({ theme }) => ({
    position: 'relative',
    width: '10px',
    flexGrow: '0',
    flexShrink: '0',
    padding: '5px 4px',
    minHeight: '15px',
    cursor: 'col-resize',
    borderRadius: '1px',
    backgroundClip: 'content-box',
    ' &:hover': {
        backgroundColor: theme.affine.palette.primary,
        '.grid-add-handle': {
            display: 'block',
        },
    },
}));

const AddGridHandle = styled('div')(({ theme }) => ({
    display: 'none',
    position: 'absolute',
    transition: 'all 0.2s ease-in-out',
    height: '6px',
    width: '6px',
    borderRadius: '6px',
    top: '-6px',
    left: '2px',
    cursor: 'pointer',
    backgroundColor: theme.affine.palette.menuSeparator,
    color: theme.affine.palette.menuSeparator,
    overflow: 'hidden',
    fontWeight: 'bold',
    lineHeight: '18px',
    textAlign: 'center',
    ' &:hover': {
        width: '20px',
        height: '20px',
        borderRadius: '10px',
        backgroundColor: theme.affine.palette.primary,
        color: theme.affine.palette.white,
        top: '-20px',
        left: '-5px',
    },
}));
