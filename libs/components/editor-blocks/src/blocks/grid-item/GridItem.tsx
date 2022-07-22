import { FC, useEffect, useLayoutEffect, useRef } from 'react';
import { ChildrenView } from '@toeverything/framework/virgo';
import { styled } from '@toeverything/components/ui';
import { sleep } from '@toeverything/utils';
import { GRID_ITEM_MIN_WIDTH, GRID_PROPERTY_KEY, removePercent } from '../grid';

export const GRID_ITEM_CLASS_NAME = 'grid-item';
export const GRID_ITEM_CONTENT_CLASS_NAME = `${GRID_ITEM_CLASS_NAME}-content`;

export const GridItem: FC<ChildrenView> = function (props) {
    const { children, block } = props;
    const RENDER_DELAY_TIME = 100;
    const ref = useRef<HTMLDivElement>();

    useLayoutEffect(() => {
        if (block && ref.current) {
            block.dom = ref.current;
        }
    });

    const setWidth = (width: string) => {
        const parent = ref.current?.parentElement as HTMLDivElement;
        parent.style.width = width;
    };

    const checkAndRefreshWidth = async () => {
        const currentWidth = block.getProperty(GRID_PROPERTY_KEY);
        if (currentWidth) {
            setWidth(currentWidth);
        } else if (!block.dom?.style.width) {
            const parent = await block.parent();
            const children = await parent.children();
            const length = children.length;
            /* TODO fix db update time is not controllable */
            await sleep(RENDER_DELAY_TIME);
            /* if do not has gridItemWidth means it is a new block ,need set new width */
            if (!block.getProperty(GRID_PROPERTY_KEY)) {
                /* only new grid has two grid */
                if (length <= 2) {
                    block.setProperty(GRID_PROPERTY_KEY, '50%');
                    setWidth('50%');
                } else {
                    const newBlockLength = Math.floor(100 / length);
                    let totalWidth = newBlockLength;
                    let index = 0;
                    const minus = newBlockLength / (length - 1);
                    setWidth(`${newBlockLength}%`);
                    await block.setProperty(
                        GRID_PROPERTY_KEY,
                        `${newBlockLength}%`
                    );
                    let needFixWidth = 0;
                    for (const child of children) {
                        if (child.id !== block.id) {
                            /* fix other block`s width */
                            const originWidth = Number(
                                removePercent(
                                    child.getProperty(GRID_PROPERTY_KEY)
                                )
                            );
                            let newWidth;
                            newWidth = Math.floor(originWidth - minus);
                            /*
                                if new width less then min width,
                                set min width and next block will be fix width
                            */
                            if (newWidth < GRID_ITEM_MIN_WIDTH) {
                                needFixWidth += GRID_ITEM_MIN_WIDTH - newWidth;
                                newWidth = GRID_ITEM_MIN_WIDTH;
                            }
                            // if can fix width, fix width
                            if (
                                newWidth > GRID_ITEM_MIN_WIDTH &&
                                needFixWidth
                            ) {
                                if (
                                    newWidth - needFixWidth >=
                                    GRID_ITEM_MIN_WIDTH
                                ) {
                                    newWidth = newWidth - needFixWidth;
                                    needFixWidth = 0;
                                } else {
                                    needFixWidth =
                                        needFixWidth -
                                        (newWidth - GRID_ITEM_MIN_WIDTH);
                                    newWidth = GRID_ITEM_MIN_WIDTH;
                                }
                            }
                            if (index === children.length - 2) {
                                // the last other block width should be 100% - other totalWidth
                                newWidth = Math.floor(100 - totalWidth);
                            }
                            totalWidth += newWidth;
                            await child.setProperty(
                                GRID_PROPERTY_KEY,
                                `${newWidth}%`
                            );
                            if (child.dom.parentElement) {
                                child.dom.parentElement.style.width = `${newWidth}%`;
                            }
                            index += 1;
                        }
                    }
                }
            }
        }
    };

    useEffect(() => {
        checkAndRefreshWidth();
    }, [block]);

    return (
        <GridItemContainer
            data-block-id={props.block.id}
            className={GRID_ITEM_CONTENT_CLASS_NAME}
            ref={ref}
        >
            {children}
        </GridItemContainer>
    );
};

const GridItemContainer = styled('div')({
    transition: 'background-color 0.3s ease-in-out',
    maxWidth: 'calc(100% - 10px)',
    padding: '4px',
    flexGrow: 1,
    border: '1px solid transparent',
    borderRadius: '4px',
});
