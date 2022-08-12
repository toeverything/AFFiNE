import React, {
    forwardRef,
    useImperativeHandle,
    useEffect,
    useRef,
    useState,
} from 'react';
import { domToRect, Point, Rect } from '@toeverything/utils';
// TODO: optimize
import { AsyncBlock, BlockEditor } from './editor';
import { styled } from '@toeverything/components/ui';

type MouseType = 'up' | 'down';

interface SelectionProps {
    editor: BlockEditor;
}

const DIRECTION_VALUE_MAP = {
    right: -1,
    left: 1,
    down: -1,
    up: 1,
} as const;

type VerticalTypes = 'up' | 'down' | null;
type HorizontalTypes = 'left' | 'right' | null;
export type SelectionRef = {
    onMouseDown: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
    onMouseMove: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
    onMouseUp: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
    onContextmenu: (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>
    ) => void;
};

const getFixedPoint = (
    { x: clientX, y: clientY }: Point,
    scrollContainerDom: HTMLElement,
    scrollContainerRect: Rect
) => {
    const { scrollHeight, scrollWidth, scrollTop, scrollLeft } =
        scrollContainerDom;
    const { top, left } = scrollContainerRect;

    const calcTop = clientY - top + scrollTop;
    const calcLeft = clientX - left + scrollLeft;

    return new Point(
        calcLeft > scrollWidth ? scrollWidth : calcLeft < 0 ? 0 : calcLeft,
        calcTop > scrollHeight ? scrollHeight : calcTop < 0 ? 0 : calcTop
    );
};

const getScrollDirections = (
    endPoint: Point,
    verticalScrollTriggerDistance: number,
    horizontalScrollTriggerDistance: number,
    scrollContainerRect: Rect
): [HorizontalTypes, VerticalTypes] => {
    let verticalDirection: VerticalTypes = null;
    let horizontalDirection: HorizontalTypes = null;

    if (endPoint.y - scrollContainerRect.top < verticalScrollTriggerDistance) {
        verticalDirection = 'up';
    }

    if (
        scrollContainerRect.height + scrollContainerRect.top - endPoint.y <
        verticalScrollTriggerDistance
    ) {
        verticalDirection = 'down';
    }

    if (
        endPoint.x - scrollContainerRect.left <
        horizontalScrollTriggerDistance
    ) {
        horizontalDirection = 'left';
    }

    if (
        scrollContainerRect.width + scrollContainerRect.left - endPoint.x <
        horizontalScrollTriggerDistance
    ) {
        horizontalDirection = 'right';
    }

    return [horizontalDirection, verticalDirection];
};

const setSelectedNodesByPoints = async (
    editor: BlockEditor,
    startPoint: Point,
    endPoint: Point
) => {
    editor.selectionManager.selectedNodesList =
        await editor.selectionManager.calcRenderBlockIntersect(
            Rect.fromPoints(startPoint, endPoint)
        );
    window.getSelection()?.removeAllRanges();
};

export const SelectionRect = forwardRef<SelectionRef, SelectionProps>(
    (props, ref) => {
        const { editor } = props;
        const { selectionManager, scrollManager } = editor;

        const [show, setShow] = useState<boolean>(false);
        const startPointRef = useRef<Point>();
        const endPointRef = useRef<Point>();
        const [rect, setRect] = useState<Rect>(Rect.fromLTRB(0, 0, 0, 0));
        const startPointBlock = useRef<AsyncBlock | null>();
        const mouseType = useRef<MouseType>('up');

        const scrollContainerRect = useRef<Rect>();

        const onMouseDown = async (
            event: React.MouseEvent<HTMLDivElement, MouseEvent>
        ) => {
            await selectionManager.setSelectedNodesIds([]);
            startPointRef.current = new Point(event.clientX, event.clientY);
            startPointBlock.current =
                ((await selectionManager.rootDomReady()) &&
                    (await editor.getBlockByPoint(startPointRef.current))) ||
                null;
            mouseType.current = 'down';
            if (scrollManager.scrollContainer) {
                scrollContainerRect.current = domToRect(
                    scrollManager.scrollContainer
                );
            }
        };

        const onMouseMove = async (
            event: React.MouseEvent<HTMLDivElement, MouseEvent>
        ) => {
            if (mouseType.current === 'down') {
                endPointRef.current = new Point(event.clientX, event.clientY);
                if (startPointBlock.current) {
                    const endpointBlock = await editor.getBlockByPoint(
                        endPointRef.current
                    );
                    // TODO: delete after multi-block text selection done
                    // if drag out of startblock change selection type to block
                    if (endpointBlock?.id === startPointBlock.current.id) {
                        return;
                    }
                    const selection = window.getSelection();
                    if (
                        selection &&
                        selection.rangeCount > 0 &&
                        editor.blockHelper.hasBlockTextUtils(
                            startPointBlock.current.id
                        )
                    ) {
                        // slate will run hooks reset selection unless mouseup,
                        // remove slate selection by textUtils
                        editor.blockHelper.setBlockBlur(
                            startPointBlock.current.id
                        );
                    }
                    event.preventDefault();
                }
                setShow(true);
                if (startPointRef.current) {
                    await setSelectedNodesByPoints(
                        editor,
                        startPointRef.current,
                        endPointRef.current
                    );
                }

                if (
                    startPointRef.current &&
                    scrollManager.scrollContainer &&
                    scrollContainerRect.current
                ) {
                    setRect(
                        Rect.fromPoints(
                            getFixedPoint(
                                startPointRef.current,
                                scrollManager.scrollContainer,
                                scrollContainerRect.current
                            ),
                            getFixedPoint(
                                endPointRef.current,
                                scrollManager.scrollContainer,
                                scrollContainerRect.current
                            )
                        )
                    );
                    const scrollDirections = getScrollDirections(
                        endPointRef.current,
                        scrollManager.verticalScrollTriggerDistance,
                        scrollManager.horizontalScrollTriggerDistance,
                        scrollContainerRect.current
                    );

                    scrollManager.startAutoScroll(scrollDirections);
                }
            }
        };

        const onMouseUp = () => {
            mouseType.current = 'up';
            startPointBlock.current = null;
            setShow(false);
            setRect(Rect.fromLTRB(0, 0, 0, 0));
            scrollManager.stopAutoScroll();
        };

        const onContextmenu = () => {
            if (mouseType.current === 'down') {
                onMouseUp();
            }
        };

        useImperativeHandle(ref, () => ({
            onMouseDown,
            onMouseMove,
            onMouseUp,
            onContextmenu,
        }));

        useEffect(() => {
            const scrollingCallback = ({
                direction,
            }: {
                direction: [HorizontalTypes, VerticalTypes];
            }) => {
                if (
                    startPointRef.current &&
                    endPointRef.current &&
                    scrollManager.scrollContainer &&
                    scrollContainerRect.current &&
                    mouseType.current === 'down'
                ) {
                    const xSign = DIRECTION_VALUE_MAP[direction[0]] || 0;
                    const ySign = DIRECTION_VALUE_MAP[direction[1]] || 0;

                    startPointRef.current = new Point(
                        startPointRef.current.x +
                            xSign * scrollManager.scrollMoveOffset,
                        startPointRef.current.y +
                            ySign * scrollManager.scrollMoveOffset
                    );

                    setSelectedNodesByPoints(
                        editor,
                        startPointRef.current,
                        endPointRef.current
                    );

                    setRect(
                        Rect.fromPoints(
                            getFixedPoint(
                                startPointRef.current,
                                scrollManager.scrollContainer,
                                scrollContainerRect.current
                            ),
                            getFixedPoint(
                                endPointRef.current,
                                scrollManager.scrollContainer,
                                scrollContainerRect.current
                            )
                        )
                    );
                }
            };

            scrollManager.onScrolling(scrollingCallback);

            return () => scrollManager.removeScrolling(scrollingCallback);
        }, [editor, scrollManager]);

        return show ? (
            <RectContainer
                style={{
                    left: `${rect.left}px`,
                    top: `${rect.top}px`,
                    height: `${rect.height}px`,
                    width: `${rect.width}px`,
                }}
            />
        ) : null;
    }
);

const RectContainer = styled('div')({
    backgroundColor: 'rgba(62, 111, 219, 0.1)',
    position: 'absolute',
    zIndex: 99,
});
