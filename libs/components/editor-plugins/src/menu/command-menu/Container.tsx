import React, {
    useEffect,
    useState,
    useMemo,
    useCallback,
    useRef,
} from 'react';
import style9 from 'style9';

import { BlockFlavorKeys } from '@toeverything/datasource/db-service';
import { Virgo, PluginHooks, HookType } from '@toeverything/framework/virgo';
import {
    CommonList,
    CommonListItem,
    commonListContainer,
} from '@toeverything/components/common';
import { domToRect } from '@toeverything/utils';

import { MenuCategories } from './Categories';
import { menuItemsMap, CommandMenuCategories } from './config';
import { QueryResult } from '../../search';
import { MuiClickAwayListener as ClickAwayListener } from '@toeverything/components/ui';

export type CommandMenuContainerProps = {
    editor: Virgo;
    hooks: PluginHooks;
    style?: React.CSSProperties;
    isShow?: boolean;
    blockId: string;
    onSelected?: (item: BlockFlavorKeys | string) => void;
    onclose?: () => void;
    searchBlocks?: QueryResult;
    types?: Array<BlockFlavorKeys | string>;
    categories: Array<CommandMenuCategories>;
};

export const CommandMenuContainer = ({
    hooks,
    isShow = false,
    onSelected,
    onclose,
    types,
    categories,
    searchBlocks,
    style,
}: CommandMenuContainerProps) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [currentItem, setCurrentItem] = useState<
        BlockFlavorKeys | string | undefined
    >();
    const [needCheckIntoView, setNeedCheckIntoView] = useState<boolean>(false);

    const current_category = useMemo(
        () =>
            (Object.entries(menuItemsMap).find(
                ([, infos]) =>
                    infos.findIndex(info => currentItem === info.type) !== -1
            )?.[0] || CommandMenuCategories.pages) as CommandMenuCategories,
        [currentItem]
    );

    useEffect(() => {
        if (needCheckIntoView) {
            if (currentItem && menuRef.current) {
                const item_ele =
                    menuRef.current.querySelector<HTMLButtonElement>(
                        `.item-${currentItem}`
                    );
                const scroll_ele =
                    menuRef.current.querySelector<HTMLButtonElement>(
                        `.${commonListContainer}`
                    );
                if (item_ele) {
                    const itemRect = domToRect(item_ele);
                    const scrollRect = domToRect(scroll_ele);
                    if (
                        itemRect.top < scrollRect.top ||
                        itemRect.bottom > scrollRect.bottom
                    ) {
                        // IMP: may be do it with self function
                        item_ele.scrollIntoView({
                            block: 'nearest',
                        });
                    }
                }
            }
            setNeedCheckIntoView(false);
        }
    }, [needCheckIntoView, currentItem]);

    useEffect(() => {
        if (isShow && types) {
            setCurrentItem(types[0]);
        }
        if (!isShow) {
            onclose && onclose();
        }
    }, [isShow]);

    useEffect(() => {
        if (isShow && types) {
            if (!types.includes(currentItem)) {
                setNeedCheckIntoView(true);
                if (types.length) {
                    setCurrentItem(types[0]);
                } else {
                    setCurrentItem(undefined);
                }
            }
        }
    }, [isShow, types, currentItem]);

    const handleClickUp = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (isShow && types && event.code === 'ArrowUp') {
                event.preventDefault();
                if (!currentItem && types.length) {
                    setCurrentItem(types[types.length - 1]);
                }
                if (currentItem) {
                    const idx = types.indexOf(currentItem);
                    if (idx > 0) {
                        setNeedCheckIntoView(true);
                        setCurrentItem(types[idx - 1]);
                    }
                }
            }
        },
        [isShow, types, currentItem]
    );

    const handleClickDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (isShow && types && event.code === 'ArrowDown') {
                event.preventDefault();
                if (!currentItem && types.length) {
                    setCurrentItem(types[0]);
                }
                if (currentItem) {
                    const idx = types.indexOf(currentItem);
                    if (idx < types.length - 1) {
                        setNeedCheckIntoView(true);
                        setCurrentItem(types[idx + 1]);
                    }
                }
            }
        },
        [isShow, types, currentItem]
    );

    const handleClickEnter = useCallback(
        async (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (isShow && event.code === 'Enter' && currentItem) {
                event.preventDefault();
                onSelected && onSelected(currentItem);
            }
        },
        [isShow, currentItem, onSelected]
    );

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            handleClickUp(event);
            handleClickDown(event);
            handleClickEnter(event);
        },
        [handleClickUp, handleClickDown, handleClickEnter]
    );

    useEffect(() => {
        hooks.addHook(HookType.ON_ROOT_NODE_KEYDOWN_CAPTURE, handleKeyDown);

        return () => {
            hooks.removeHook(
                HookType.ON_ROOT_NODE_KEYDOWN_CAPTURE,
                handleKeyDown
            );
        };
    }, [hooks, handleKeyDown]);

    const handleSetCategories = (type: CommandMenuCategories) => {
        const newItem = menuItemsMap[type][0].type;
        setNeedCheckIntoView(true);
        setCurrentItem(newItem);
    };

    const items = useMemo(() => {
        const blocks = searchBlocks?.map(
            block => ({ block } as CommonListItem)
        );
        if (blocks?.length) {
            blocks.push({ divider: CommandMenuCategories.pages });
        }
        return [
            ...(blocks || []),
            ...Object.entries(menuItemsMap).flatMap(
                ([category, items], idx, all) => {
                    let render_separator = false;
                    const lines: CommonListItem[] = items
                        .filter(item => types.includes(item.type))
                        .map(item => {
                            const { text, type, icon } = item;
                            render_separator = true;
                            return {
                                content: { id: type, content: text, icon },
                            };
                        });
                    if (render_separator && idx !== all.length - 1) {
                        lines.push({ divider: category });
                    }
                    return lines;
                }
            ),
        ];
    }, [searchBlocks, types]);

    return isShow ? (
        <div
            ref={menuRef}
            className={styles('rootContainer')}
            onKeyDownCapture={handleKeyDown}
            style={style}
        >
            <div className={styles('contentContainer')}>
                <MenuCategories
                    currentCategories={current_category}
                    onSetCategories={handleSetCategories}
                    categories={categories}
                />
                <CommonList
                    items={items}
                    onSelected={type => onSelected?.(type)}
                    currentItem={currentItem}
                    setCurrentItem={setCurrentItem}
                />
            </div>
        </div>
    ) : null;
};

const styles = style9.create({
    rootContainer: {
        position: 'fixed',
        zIndex: 1,
        width: 352,
        maxHeight: 525,
        borderRadius: '10px',
        boxShadow: '0px 1px 10px rgba(152, 172, 189, 0.6)',
        backgroundColor: '#fff',
        padding: '8px 4px',
    },
    contentContainer: {
        display: 'flex',
        overflow: 'hidden',
        maxHeight: 493,
    },
});
