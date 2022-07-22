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
    const menu_ref = useRef<HTMLDivElement>(null);
    const [current_item, set_current_item] = useState<
        BlockFlavorKeys | string | undefined
    >();
    const [need_check_into_view, set_need_check_into_view] =
        useState<boolean>(false);

    const current_category = useMemo(
        () =>
            (Object.entries(menuItemsMap).find(
                ([, infos]) =>
                    infos.findIndex(info => current_item === info.type) !== -1
            )?.[0] || CommandMenuCategories.pages) as CommandMenuCategories,
        [current_item]
    );

    useEffect(() => {
        if (need_check_into_view) {
            if (current_item && menu_ref.current) {
                const item_ele =
                    menu_ref.current.querySelector<HTMLButtonElement>(
                        `.item-${current_item}`
                    );
                const scroll_ele =
                    menu_ref.current.querySelector<HTMLButtonElement>(
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
            set_need_check_into_view(false);
        }
    }, [need_check_into_view, current_item]);

    useEffect(() => {
        if (isShow && types) {
            set_current_item(types[0]);
        }
        if (!isShow) {
            onclose && onclose();
        }
    }, [isShow]);

    useEffect(() => {
        if (isShow && types) {
            if (!types.includes(current_item)) {
                set_need_check_into_view(true);
                if (types.length) {
                    set_current_item(types[0]);
                } else {
                    set_current_item(undefined);
                }
            }
        }
    }, [isShow, types, current_item]);

    const handle_click_up = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (isShow && types && event.code === 'ArrowUp') {
                event.preventDefault();
                if (!current_item && types.length) {
                    set_current_item(types[types.length - 1]);
                }
                if (current_item) {
                    const idx = types.indexOf(current_item);
                    if (idx > 0) {
                        set_need_check_into_view(true);
                        set_current_item(types[idx - 1]);
                    }
                }
            }
        },
        [isShow, types, current_item]
    );

    const handle_click_down = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (isShow && types && event.code === 'ArrowDown') {
                event.preventDefault();
                if (!current_item && types.length) {
                    set_current_item(types[0]);
                }
                if (current_item) {
                    const idx = types.indexOf(current_item);
                    if (idx < types.length - 1) {
                        set_need_check_into_view(true);
                        set_current_item(types[idx + 1]);
                    }
                }
            }
        },
        [isShow, types, current_item]
    );

    const handle_click_enter = useCallback(
        async (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (isShow && event.code === 'Enter' && current_item) {
                event.preventDefault();
                onSelected && onSelected(current_item);
            }
        },
        [isShow, current_item, onSelected]
    );

    const handle_key_down = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            handle_click_up(event);
            handle_click_down(event);
            handle_click_enter(event);
        },
        [handle_click_up, handle_click_down, handle_click_enter]
    );

    useEffect(() => {
        hooks.addHook(HookType.ON_ROOT_NODE_KEYDOWN_CAPTURE, handle_key_down);

        return () => {
            hooks.removeHook(
                HookType.ON_ROOT_NODE_KEYDOWN_CAPTURE,
                handle_key_down
            );
        };
    }, [hooks, handle_key_down]);

    const handleSetCategories = (type: CommandMenuCategories) => {
        const newItem = menuItemsMap[type][0].type;
        set_need_check_into_view(true);
        set_current_item(newItem);
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
            ref={menu_ref}
            className={styles('rootContainer')}
            onKeyDownCapture={handle_key_down}
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
                    currentItem={current_item}
                    setCurrentItem={set_current_item}
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
