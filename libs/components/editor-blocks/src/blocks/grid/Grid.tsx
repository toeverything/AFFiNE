import { BlockRender } from '@toeverything/components/editor-core';
import { styled } from '@toeverything/components/ui';
import { Protocol } from '@toeverything/datasource/db-service';
import { CreateView } from '@toeverything/framework/virgo';
import { debounce, domToRect, Point } from '@toeverything/utils';
import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
    GRID_ITEM_CLASS_NAME,
    GRID_ITEM_CONTENT_CLASS_NAME,
} from '../grid-item/GridItem';
import { GridHandle } from './GirdHandle';

const DB_UPDATE_DELAY = 50;
const GRID_ON_DRAG_CLASS = 'grid-layout-on-drag';
export const GRID_PROPERTY_KEY = 'gridItemWidth';

export function removePercent(str: string) {
    return str.replace('%', '');
}

export const Grid = function (props: CreateView) {
    const { block, editor } = props;
    const gridItemMinWidth = editor.configManager.grid.gridItemMinWidth;
    const [isOnDrag, setIsOnDrag] = useState<boolean>(false);
    const isSetMouseUp = useRef<boolean>(false);
    const gridContainerRef = useRef<HTMLDivElement>();
    const mouseStartPoint = useRef<Point>();
    const gridItemCountRef = useRef<number>();
    const originalLeftWidth = useRef<number>(gridItemMinWidth);
    const originalRightWidth = useRef<number>(gridItemMinWidth);
    const [alertHandleId, setAlertHandleId] = useState<string>(null);

    const getLeftRightGridItemDomByIndex = (index: number) => {
        const gridItems = Array.from(gridContainerRef.current?.children).filter(
            child => {
                return child.classList.contains(GRID_ITEM_CLASS_NAME);
            }
        ) as Array<HTMLDivElement>;
        const leftGrid = gridItems[index];
        const rightGrid = gridItems[index + 1];
        return { leftGrid, rightGrid };
    };

    useEffect(() => {
        mayBeRefreshGridItemWidth();
    }, [block.childrenIds]);

    const mayBeRefreshGridItemWidth = async () => {
        const gridItems = (await block.children()).filter(
            child => child.type === Protocol.Block.Type.gridItem
        );
        if (gridItems.length < gridItemCountRef.current) {
            let totalWidth = 0;
            const widthList = [];
            for (const gridItem of gridItems) {
                const itemWidth = Number(
                    removePercent(gridItem.getProperty(GRID_PROPERTY_KEY))
                );
                totalWidth += itemWidth;
                widthList.push(itemWidth);
            }
            if (totalWidth < 100) {
                const plus = (100 - totalWidth) / gridItems.length;
                let totalNewWidth = 0;
                let index = 0;
                for (const gridItem of gridItems) {
                    const newWidth = widthList.pop() + plus;
                    let newWidthStr = `${newWidth}%`;
                    if (index === gridItems.length - 1) {
                        newWidthStr = `${100 - totalNewWidth}%`;
                    }
                    if (gridItem.dom) {
                        setItemWidth(
                            gridItem.dom.parentElement as HTMLDivElement,
                            newWidthStr
                        );
                    }
                    await gridItem.setProperty(GRID_PROPERTY_KEY, newWidthStr);
                    totalNewWidth += newWidth;
                    index += 1;
                }
            }
        }
        gridItemCountRef.current = gridItems.length;
    };

    const handleMouseDown = (
        e: React.MouseEvent<HTMLDivElement>,
        index: number
    ) => {
        mouseStartPoint.current = new Point(e.clientX, e.clientY);
        const { leftGrid, rightGrid } = getLeftRightGridItemDomByIndex(index);
        originalLeftWidth.current = domToRect(leftGrid).width;
        originalRightWidth.current = domToRect(rightGrid).width;
        // disable the default behavior of the drag event (selection about)
        e.stopPropagation();
    };

    const updateDbWidth = debounce(
        async (
            leftBlockId: string,
            leftWidth: string,
            rightBlockId: string,
            rightWidth: string
        ) => {
            const leftBlock = await editor.getBlockById(leftBlockId);
            const rightBlock = await editor.getBlockById(rightBlockId);
            leftBlock?.setProperty(GRID_PROPERTY_KEY, leftWidth);
            rightBlock?.setProperty(GRID_PROPERTY_KEY, rightWidth);
        },
        DB_UPDATE_DELAY
    );

    const setItemWidth = (itemDom: HTMLDivElement, width: string) => {
        itemDom.style.width = width;
    };

    const handleDragGrid = async (e: MouseEvent, index: number) => {
        setIsOnDrag(true);
        window.getSelection().removeAllRanges();
        if (!isSetMouseUp.current) {
            isSetMouseUp.current = true;
            editor.mouseManager.onMouseupEventOnce(() => {
                setIsOnDrag(false);
                isSetMouseUp.current = false;
                originalLeftWidth.current = gridItemMinWidth;
                originalRightWidth.current = gridItemMinWidth;
                mouseStartPoint.current = null;
            });
        } else {
            const { leftGrid, rightGrid } =
                getLeftRightGridItemDomByIndex(index);
            const leftBlockId = block.childrenIds[index];
            const rightBlockId = block.childrenIds[index + 1];
            if (
                leftGrid &&
                rightGrid &&
                mouseStartPoint.current &&
                gridContainerRef.current
            ) {
                const currentMousePoint = new Point(e.clientX, e.clientY);
                const totalWidth =
                    Number(removePercent(leftGrid.style.width)) +
                    Number(removePercent(rightGrid.style.width));
                const containerWidth = domToRect(
                    gridContainerRef.current
                ).width;
                const xDistance =
                    mouseStartPoint.current.xDistance(currentMousePoint);
                const newLeftWidth = originalLeftWidth.current - xDistance;
                let newLeftPercent = (newLeftWidth / containerWidth) * 100;
                let newRightPercent = Number(totalWidth) - newLeftPercent;
                if (newLeftPercent < gridItemMinWidth) {
                    newLeftPercent = gridItemMinWidth;
                    newRightPercent = totalWidth - gridItemMinWidth;
                } else if (newRightPercent < gridItemMinWidth) {
                    newRightPercent = gridItemMinWidth;
                    newLeftPercent = totalWidth - gridItemMinWidth;
                }
                //XXX first change dom style is for animation speed, maybe not a good idea
                const newLeft = `${newLeftPercent}%`;
                const newRight = `${newRightPercent}%`;
                setItemWidth(leftGrid, newLeft);
                setItemWidth(rightGrid, newRight);
                updateDbWidth(leftBlockId, newLeft, rightBlockId, newRight);
                [leftBlockId, rightBlockId].forEach(async blockId => {
                    if (await checkGridItemHasOverflow(blockId)) {
                        setAlertHandleId(leftBlockId);
                    } else {
                        setAlertHandleId(null);
                    }
                });
            }
        }
    };

    const checkGridItemHasOverflow = async (blockId: string) => {
        let isOverflow = false;
        const block = await editor.getBlockById(blockId);
        if (block) {
            const blockDom = block.dom;
            if (blockDom) {
                block.dom.style.overflow = 'scroll';
                if (block.dom.clientWidth !== block.dom.scrollWidth) {
                    isOverflow = true;
                }
                blockDom.style.overflow = 'visible';
            }
        }
        return isOverflow;
    };

    const handleHandleMouseEnter = (
        e: React.MouseEvent<HTMLDivElement>,
        index: number
    ) => {
        const leftBlockId = block.childrenIds[index];
        const rightBlockId = block.childrenIds[index + 1];
        [leftBlockId, rightBlockId].forEach(async blockId => {
            if (await checkGridItemHasOverflow(blockId)) {
                setAlertHandleId(leftBlockId);
            } else {
                setAlertHandleId(null);
            }
        });
    };

    return (
        <>
            <GridContainer
                className={clsx({ [GRID_ON_DRAG_CLASS]: isOnDrag })}
                ref={gridContainerRef}
                gridItemMinWidth={gridItemMinWidth}
                isOnDrag={isOnDrag}
            >
                {block.childrenIds.map((id, i) => {
                    return (
                        <GridItem
                            style={{
                                transition: isOnDrag
                                    ? 'none'
                                    : 'all 0.2s ease-in-out',
                            }}
                            key={id}
                            className={GRID_ITEM_CLASS_NAME}
                        >
                            <BlockRender hasContainer={false} blockId={id} />
                            <GridHandle
                                onDrag={event => handleDragGrid(event, i)}
                                editor={editor}
                                onMouseDown={event => handleMouseDown(event, i)}
                                blockId={id}
                                enabledAddItem={
                                    block.childrenIds.length <
                                    editor.configManager.grid.maxGridItemCount
                                }
                                onMouseEnter={event =>
                                    handleHandleMouseEnter(event, i)
                                }
                                alertHandleId={alertHandleId}
                                draggable={i !== block.childrenIds.length - 1}
                            />
                        </GridItem>
                    );
                })}
            </GridContainer>
            {isOnDrag
                ? ReactDOM.createPortal(<GridMask />, window.document.body)
                : null}
        </>
    );
};

const GridContainer = styled('div')<{
    isOnDrag: boolean;
    gridItemMinWidth: number;
}>(({ isOnDrag, theme, gridItemMinWidth }) => ({
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch',
    borderRadius: '10px',
    border: '1px solid transparent',
    minWidth: `${gridItemMinWidth}%`,
    [`&:hover .${GRID_ITEM_CONTENT_CLASS_NAME}`]: {
        borderColor: theme.affine.palette.borderColor,
    },
    ...(isOnDrag && {
        [`& .${GRID_ITEM_CONTENT_CLASS_NAME}`]: {
            borderColor: theme.affine.palette.borderColor,
        },
    }),
}));

const GridMask = styled('div')({
    position: 'fixed',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    cursor: 'col-resize',
    pointerEvents: 'all',
});

const GridItem = styled('div')({
    display: 'flex',
    flexShrink: 0,
    flexGrow: 0,
});
