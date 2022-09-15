import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import {
    CommonList,
    commonListContainer,
    CommonListItem,
} from '@toeverything/components/common';
import { BlockFlavorKeys } from '@toeverything/datasource/db-service';
import { HookType, PluginHooks, Virgo } from '@toeverything/framework/virgo';
import { domToRect } from '@toeverything/utils';

import { styled } from '@toeverything/components/ui';
import { QueryResult } from '../../search';
import { MenuCategories } from './Categories';
import { CommandMenuCategories, menuItemsMap } from './config';

const RootContainer = styled('div')(({ theme }) => {
    return {
        position: 'absolute',
        zIndex: 1,
        width: 352,
        maxHeight: 525,
        borderRadius: '10px',
        boxShadow: theme.affine.shadows.shadow1,
        backgroundColor: '#fff',
        padding: '8px 4px',
    };
});
const ContentContainer = styled('div')(({ theme }) => {
    return {
        display: 'flex',
        overflow: 'hidden',
        maxHeight: '35vh',
    };
});
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

    const currentCategory = useMemo(
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
                const itemEle =
                    menuRef.current.querySelector<HTMLButtonElement>(
                        `.item-${currentItem}`
                    );
                const scrollEle =
                    menuRef.current.querySelector<HTMLButtonElement>(
                        `.${commonListContainer}`
                    );
                if (itemEle) {
                    const itemRect = domToRect(itemEle);
                    const scrollRect = domToRect(scrollEle);
                    if (
                        itemRect.top < scrollRect.top ||
                        itemRect.bottom > scrollRect.bottom
                    ) {
                        // IMP: may be do it with self function
                        itemEle.scrollIntoView({
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
        },
        [types, currentItem]
    );

    const handleClickDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
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
        },
        [types, currentItem]
    );

    const handleClickEnter = useCallback(
        async (event: React.KeyboardEvent<HTMLDivElement>) => {
            event.preventDefault();
            onSelected && onSelected(currentItem);
        },
        [currentItem, onSelected]
    );

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (!isShow) {
                return;
            }
            if (event.nativeEvent.isComposing) {
                return;
            }
            if (types && event.code === 'ArrowUp') {
                handleClickUp(event);
                return;
            }
            if (types && event.code === 'ArrowDown') {
                handleClickDown(event);
                return;
            }
            if (event.code === 'Enter' && currentItem) {
                handleClickEnter(event);
                return;
            }
        },
        [
            isShow,
            types,
            currentItem,
            handleClickUp,
            handleClickDown,
            handleClickEnter,
        ]
    );

    useEffect(() => {
        const sub = hooks
            .get(HookType.ON_ROOT_NODE_KEYDOWN_CAPTURE)
            .subscribe(handleKeyDown);

        return () => {
            sub.unsubscribe();
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
                    let renderSeparator = false;
                    const lines: CommonListItem[] = items
                        .filter(item => types.includes(item.type))
                        .map(item => {
                            const { text, type, icon } = item;
                            renderSeparator = true;
                            return {
                                content: { id: type, content: text, icon },
                            };
                        });
                    if (renderSeparator && idx !== all.length - 1) {
                        lines.push({ divider: category });
                    }
                    return lines;
                }
            ),
        ];
    }, [searchBlocks, types]);

    return isShow ? (
        <RootContainer
            ref={menuRef}
            onKeyDownCapture={handleKeyDown}
            style={style}
        >
            <ContentContainer>
                <MenuCategories
                    currentCategories={currentCategory}
                    onSetCategories={handleSetCategories}
                    categories={categories}
                />
                <CommonList
                    items={items}
                    onSelected={type => onSelected?.(type)}
                    currentItem={currentItem}
                    setCurrentItem={setCurrentItem}
                />
            </ContentContainer>
        </RootContainer>
    ) : null;
};
