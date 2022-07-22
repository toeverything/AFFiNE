import React, {
    forwardRef,
    useCallback,
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
    container?: HTMLElement;
    editor: BlockEditor;
}

const styles = style9.create({
    selectionRect: {
        backgroundColor: 'rgba(152, 172, 189, 0.1)',
        position: 'absolute',
        zIndex: 99,
    },
});

type VerticalTypes = 'up' | 'down' | null;
type HorizontalTypes = 'left' | 'right' | null;
export type SelectionRef = {
    onMouseDown: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
    onMouseMove: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
    onMouseUp: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
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
        const { container, editor } = props;
        const { selectionManager, scrollManager } = editor;

        const [isShow, setIsShow] = useState<boolean>(false);
        const startPointRef = useRef<Point>();
        const endPointRef = useRef<Point>();
        const [rect, setRect] = useState<Rect>(Rect.fromLTRB(0, 0, 0, 0));
        const startPointAtBlock = useRef<boolean>(false);
        const mouseType = useRef<MouseType>('up');

        const scrollContainerRect = useRef<Rect>();

        const onMouseDown = async (
            event: React.MouseEvent<HTMLDivElement, MouseEvent>
        ) => {
            await selectionManager.setSelectedNodesIds([]);
            startPointRef.current = new Point(event.clientX, event.clientY);
            startPointAtBlock.current =
                (await selectionManager.rootDomReady()) &&
                (await selectionManager.isPointInBlocks(startPointRef.current));
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
            if (mouseType.current === 'down' && !startPointAtBlock.current) {
                event.preventDefault();
                endPointRef.current = new Point(event.clientX, event.clientY);
                setIsShow(true);

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
            startPointAtBlock.current = false;
            setIsShow(false);
            scrollManager.stopAutoScroll();
        };

        useImperativeHandle(ref, () => ({
            onMouseDown,
            onMouseMove,
            onMouseUp,
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
                    scrollContainerRect.current
                ) {
                    const xValue =
                        direction[0] === 'right'
                            ? -1
                            : direction[0] === 'left'
                            ? 1
                            : 0;
                    const yValue =
                        direction[1] === 'down'
                            ? -1
                            : direction[1] === 'up'
                            ? 1
                            : 0;

                    startPointRef.current = new Point(
                        startPointRef.current.x +
                            xValue * scrollManager.scrollMoveOffset,
                        startPointRef.current.y +
                            yValue * scrollManager.scrollMoveOffset
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
        }, [scrollManager]);

        return isShow ? (
            <div
                className={styles('selectionRect')}
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
