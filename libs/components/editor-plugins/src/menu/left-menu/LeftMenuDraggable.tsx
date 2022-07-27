import { useState, useEffect, FC } from 'react';

import {
    Virgo,
    BlockDomInfo,
    PluginHooks,
    BlockDropPlacement,
} from '@toeverything/framework/virgo';
import { Button } from '@toeverything/components/common';
import { styled } from '@toeverything/components/ui';

import { LeftMenu } from './LeftMenu';
import { debounce } from '@toeverything/utils';
import type { Subject } from 'rxjs';
import { HandleChildIcon } from '@toeverything/components/icons';
import { MENU_WIDTH } from './menu-config';

const MENU_BUTTON_OFFSET = 12;

export type LineInfoSubject = Subject<
    | {
          direction: BlockDropPlacement;
          blockInfo: BlockDomInfo;
      }
    | undefined
>;

export type LeftMenuProps = {
    editor: Virgo;
    hooks: PluginHooks;
    defaultVisible?: boolean;
    blockInfo: Subject<BlockDomInfo | undefined>;
    lineInfo: LineInfoSubject;
};

type LineInfo = {
    direction: BlockDropPlacement;
    blockInfo: BlockDomInfo;
};

function Line(props: { lineInfo: LineInfo; rootRect: DOMRect }) {
    const { lineInfo, rootRect } = props;
    if (!lineInfo || lineInfo.direction === BlockDropPlacement.none) {
        return null;
    }
    const { direction, blockInfo } = lineInfo;
    const finalDirection = direction;
    const lineStyle = {
        zIndex: 2,
        position: 'absolute' as const,
        background: '#502EC4',
    };

    const intersectionRect = blockInfo.rect;

    const horizontalLineStyle = {
        ...lineStyle,
        width: intersectionRect.width,
        height: 2,
        left: intersectionRect.x - rootRect.x,
    };
    const topLineStyle = {
        ...horizontalLineStyle,
        top: intersectionRect.top,
    };
    const bottomLineStyle = {
        ...horizontalLineStyle,
        top: intersectionRect.bottom + 1 - rootRect.y,
    };

    const verticalLineStyle = {
        ...lineStyle,
        width: 2,
        height: intersectionRect.height,
        top: intersectionRect.y - rootRect.y,
    };
    const leftLineStyle = {
        ...verticalLineStyle,
        left: intersectionRect.x - 10 - rootRect.x,
    };
    const rightLineStyle = {
        ...verticalLineStyle,
        left: intersectionRect.right + 10 - rootRect.x,
    };
    const styleMap = {
        left: leftLineStyle,
        right: rightLineStyle,
        top: topLineStyle,
        bottom: bottomLineStyle,
    };
    return (
        <div className="editor-menu-line" style={styleMap[finalDirection]} />
    );
}

function DragComponent(props: {
    children: React.ReactNode;
    style: React.CSSProperties;
    onDragStart: (event: React.DragEvent<Element>) => void;
    onDragEnd: (event: React.DragEvent<Element>) => void;
}) {
    const { style, children, onDragStart, onDragEnd } = props;
    return (
        <LigoLeftMenu
            draggable
            style={style}
            onMouseMove={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
        >
            {children}
        </LigoLeftMenu>
    );
}

export const LeftMenuDraggable: FC<LeftMenuProps> = props => {
    const { editor, blockInfo, defaultVisible, lineInfo } = props;
    const [visible, setVisible] = useState(defaultVisible);
    const [anchorEl, setAnchorEl] = useState<Element>();

    const [rootRect, setRootRect] = useState(() => new DOMRect());
    const [block, setBlock] = useState<BlockDomInfo | undefined>();
    const [line, setLine] = useState<LineInfo | undefined>(undefined);

    const handleDragStart = (event: React.DragEvent<Element>) => {
        window.addEventListener('dragover', handleDragOverCapture, {
            capture: true,
        });

        const onDragStart = async (event: React.DragEvent<Element>) => {
            editor.dragDropManager.isOnDrag = true;
            if (block == null) return;
            setRootRect(editor.container.getBoundingClientRect());
            const dragImage = await editor.blockHelper.getBlockDragImg(
                block.blockId
            );
            if (dragImage) {
                event.dataTransfer.setDragImage(dragImage, -50, -10);
                editor.dragDropManager.setDragBlockInfo(event, block.blockId);
            }
            setVisible(false);
        };
        onDragStart(event);
        event.stopPropagation();
    };

    const handleDragEnd = (event: React.DragEvent<Element>) => {
        event.preventDefault();
        window.removeEventListener('dragover', handleDragOverCapture, {
            capture: true,
        });
        setLine(undefined);
    };

    const onClick = (event: React.MouseEvent) => {
        if (block == null) return;
        const currentTarget = event.currentTarget;
        editor.selection.setSelectedNodesIds([block.blockId]);
        setVisible(true);
        setAnchorEl(currentTarget);
    };

    /**
     * clear line info
     */
    const handleDragOverCapture = debounce((e: MouseEvent) => {
        const { target } = e;
        if (
            target instanceof HTMLElement &&
            (!target.closest('[data-block-id]') ||
                !editor.container.contains(target))
        ) {
            setLine(undefined);
        }
    }, 10);

    useEffect(() => {
        const sub = blockInfo.subscribe(block => {
            setBlock(block);
            if (block != null) {
                setRootRect(editor.container.getBoundingClientRect());
                setVisible(true);
            }
        });
        return () => sub.unsubscribe();
    }, [blockInfo, editor]);

    useEffect(() => {
        const sub = lineInfo.subscribe(data => {
            if (data == null) {
                setLine(undefined);
            } else {
                const { direction, blockInfo } = data;
                setRootRect(editor.container.getBoundingClientRect());
                setLine(prev => {
                    if (
                        prev?.blockInfo.blockId !== blockInfo.blockId ||
                        prev?.direction !== direction
                    ) {
                        return {
                            direction,
                            blockInfo,
                        };
                    } else {
                        return prev;
                    }
                });
            }
        });
        return () => sub.unsubscribe();
    }, [editor, lineInfo]);

    return (
        <>
            {block && (
                <DragComponent
                    style={{
                        position: 'absolute',
                        left:
                            Math.min(
                                block.rect.left -
                                    MENU_WIDTH -
                                    MENU_BUTTON_OFFSET
                            ) - rootRect.left,
                        top: block.rect.top - rootRect.top,
                        opacity: visible ? 1 : 0,
                        zIndex: 1,
                    }}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    {
                        <LeftMenu
                            anchorEl={anchorEl}
                            editor={props.editor}
                            hooks={props.hooks}
                            onClose={() => setAnchorEl(undefined)}
                            blockId={block.blockId}
                        >
                            <Draggable onClick={onClick}>
                                <HandleChildIcon />
                            </Draggable>
                        </LeftMenu>
                    }
                </DragComponent>
            )}
            <Line lineInfo={line} rootRect={rootRect} />
        </>
    );
};

const Draggable = styled(Button)({
    cursor: 'grab',
    padding: '0',
    display: 'inlineFlex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    width: '24px',
    height: '24px',
    ':hover': {
        backgroundColor: '#edeef0',
        borderRadius: '4px',
    },
});

const LigoLeftMenu = styled('div')({
    backgroundColor: 'transparent',
    marginRight: '4px',
});
