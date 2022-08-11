import {
    useState,
    useEffect,
    FC,
    type MouseEvent,
    type DragEvent,
    type ReactNode,
    type CSSProperties,
    useCallback,
} from 'react';

import {
    Virgo,
    PluginHooks,
    BlockDropPlacement,
    LINE_GAP,
    AsyncBlock,
    TAG_GAP,
} from '@toeverything/framework/virgo';
import { Button } from '@toeverything/components/common';
import { styled } from '@toeverything/components/ui';

import { LeftMenu } from './LeftMenu';
import { distinctUntilChanged, Subject } from 'rxjs';
import { HandleChildIcon } from '@toeverything/components/icons';
import { MENU_WIDTH } from './menu-config';

const MENU_BUTTON_OFFSET = 4;

export interface BlockDomInfo {
    block: AsyncBlock;
    rect: DOMRect;
}

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
        top: intersectionRect.bottom + 1 - rootRect.y - LINE_GAP + TAG_GAP,
    };

    const verticalLineStyle = {
        ...lineStyle,
        width: 2,
        height: intersectionRect.height - LINE_GAP + TAG_GAP,
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
        [BlockDropPlacement.left]: leftLineStyle,
        [BlockDropPlacement.right]: rightLineStyle,
        [BlockDropPlacement.top]: topLineStyle,
        [BlockDropPlacement.bottom]: bottomLineStyle,
        [BlockDropPlacement.outerLeft]: leftLineStyle,
        [BlockDropPlacement.outerRight]: rightLineStyle,
    };
    return <div className="editor-menu-line" style={styleMap[direction]} />;
}

function DragComponent(props: {
    children: ReactNode;
    style: CSSProperties;
    onDragStart: (event: DragEvent<Element>) => void;
    onDragEnd: (event: DragEvent<Element>) => void;
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

export const LeftMenuDraggable = (props: LeftMenuProps) => {
    const { editor, blockInfo, defaultVisible, lineInfo } = props;
    const [visible, setVisible] = useState(defaultVisible);
    const [anchorEl, setAnchorEl] = useState<Element>();

    const [rootRect, setRootRect] = useState(() => new DOMRect());
    const [block, setBlock] = useState<BlockDomInfo | undefined>();
    const [line, setLine] = useState<LineInfo | undefined>(undefined);

    const handleDragStart = async (event: DragEvent<Element>) => {
        event.stopPropagation();
        setVisible(false);

        editor.dragDropManager.isOnDrag = true;
        if (block == null) return;
        setRootRect(editor.container.getBoundingClientRect());
        const dragImage = await editor.blockHelper.getBlockDragImg(
            block.block.id
        );
        if (dragImage) {
            event.dataTransfer.setDragImage(dragImage, -50, -10);
            editor.dragDropManager.setDragBlockInfo(event, block.block.id);
        }
    };

    const handleDragEnd = (event: DragEvent<Element>) => {
        event.preventDefault();
        setLine(undefined);
    };

    const onClick = (event: MouseEvent<Element>) => {
        if (block == null) return;
        const currentTarget = event.currentTarget;
        editor.selection.setSelectedNodesIds([block.block.id]);
        setVisible(true);
        setAnchorEl(currentTarget);
    };

    const onClose = useCallback(() => setAnchorEl(undefined), [setAnchorEl]);

    useEffect(() => {
        const sub = blockInfo
            .pipe(
                distinctUntilChanged(
                    (prev, curr) => prev?.block.id === curr?.block.id
                )
            )
            .subscribe(block => {
                setBlock(block);
                if (block != null) {
                    setRootRect(editor.container.getBoundingClientRect());
                    setVisible(true);
                }
            });
        return () => sub.unsubscribe();
    }, [blockInfo, editor]);

    useEffect(() => {
        if (block?.block != null) {
            const unobserve = block.block.onUpdate(() => setBlock(undefined));
            return unobserve;
        }
        return undefined;
    }, [block?.block]);

    useEffect(() => {
        const sub = lineInfo.subscribe(data => {
            if (data == null) {
                setLine(undefined);
            } else {
                const { direction, blockInfo } = data;
                setRootRect(editor.container.getBoundingClientRect());
                setLine(prev => {
                    if (
                        prev?.blockInfo.block.id !== blockInfo.block.id ||
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
                            block.rect.left -
                            MENU_WIDTH -
                            MENU_BUTTON_OFFSET -
                            rootRect.left,
                        top: block.rect.top - rootRect.top + TAG_GAP * 2,
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
                            onClose={onClose}
                            blockId={block.block.id}
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
    width: '16px',
    height: '22px',
    '& svg': {
        fontSize: '20px',
        marginLeft: '-2px',
    },
    ':hover': {
        backgroundColor: '#F5F7F8',
        borderRadius: '4px',
    },
});

const LigoLeftMenu = styled('div')({
    backgroundColor: 'transparent',
    // marginRight: '4px',
});
