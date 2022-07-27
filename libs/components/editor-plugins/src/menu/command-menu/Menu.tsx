import { BlockFlavorKeys, Protocol } from '@toeverything/datasource/db-service';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import style9 from 'style9';

import { MuiClickAwayListener } from '@toeverything/components/ui';
import { Virgo, HookType, PluginHooks } from '@toeverything/framework/virgo';

import { CommandMenuContainer } from './Container';
import {
    CommandMenuCategories,
    commandMenuHandlerMap,
    commonCommandMenuHandler,
    menuItemsMap,
} from './config';
import { QueryBlocks, QueryResult } from '../../search';

export type CommandMenuProps = {
    editor: Virgo;
    hooks: PluginHooks;
    style?: { left: number; top: number };
};
type CommandMenuPosition = {
    left: number;
    top: number | 'initial';
    bottom: number | 'initial';
};

export const CommandMenu = ({ editor, hooks, style }: CommandMenuProps) => {
    const [is_show, set_is_show] = useState(false);
    const [block_id, set_block_id] = useState<string>();
    const [commandMenuPosition, setCommandMenuPosition] =
        useState<CommandMenuPosition>({
            left: 0,
            top: 0,
            bottom: 0,
        });

    const [search_text, set_search_text] = useState<string>('');
    const [search_blocks, set_search_blocks] = useState<QueryResult>([]);
    const commandMenuContentRef = useRef();
    // TODO: Two-way link to be developed
    // useEffect(() => {
    //     QueryBlocks(editor, search_text, result => set_search_blocks(result));
    // }, [editor, search_text]);

    const [types, categories] = useMemo(() => {
        const types: Array<BlockFlavorKeys | string> = [];
        const categories: Array<CommandMenuCategories> = [];
        if (search_blocks.length) {
            Object.values(search_blocks).forEach(({ id }) => types.push(id));
            categories.push(CommandMenuCategories.pages);
        }
        Object.entries(menuItemsMap).forEach(([category, itemInfoList]) => {
            itemInfoList.forEach(info => {
                if (
                    !search_text ||
                    info.text.toLowerCase().includes(search_text.toLowerCase())
                ) {
                    types.push(info.type);
                }

                if (
                    !categories.includes(category as CommandMenuCategories) ||
                    types.includes(info.type)
                ) {
                    categories.push(category as CommandMenuCategories);
                }
            });
        });
        return [types, categories];
    }, [search_blocks, search_text]);

    const check_if_show_command_menu = useCallback(
        async (event: React.KeyboardEvent<HTMLDivElement>) => {
            const { type, anchorNode } = editor.selection.currentSelectInfo;
            if (event.key === '/' && type === 'Range') {
                if (anchorNode) {
                    const text = editor.blockHelper.getBlockTextBeforeSelection(
                        anchorNode.id
                    );
                    if (text.endsWith('/')) {
                        set_block_id(anchorNode.id);
                        editor.blockHelper.removeSearchSlash(block_id);
                        setTimeout(() => {
                            const textSelection =
                                editor.blockHelper.selectionToSlateRange(
                                    anchorNode.id,
                                    editor.selection.currentSelectInfo
                                        .browserSelection
                                );
                            if (textSelection) {
                                const { anchor } = textSelection;
                                editor.blockHelper.setSearchSlash(
                                    anchorNode.id,
                                    anchor
                                );
                            }
                        });
                        set_search_text('');
                        set_is_show(true);
                        const rect =
                            editor.selection.currentSelectInfo?.browserSelection
                                ?.getRangeAt(0)
                                ?.getBoundingClientRect();
                        if (rect) {
                            let top = rect.top;
                            let clientHeight =
                                document.documentElement.clientHeight;

                            const COMMAND_MENU_HEIGHT = 509;
                            if (clientHeight - top <= COMMAND_MENU_HEIGHT) {
                                top = clientHeight - top + 10;
                                setCommandMenuPosition({
                                    left: rect.left,
                                    bottom: top,
                                    top: 'initial',
                                });
                            } else {
                                top += 24;
                                setCommandMenuPosition({
                                    left: rect.left,
                                    top: top,
                                    bottom: 'initial',
                                });
                            }
                        }
                    }
                }
            }
        },
        [editor, block_id]
    );

    const handle_click_others = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (is_show) {
                const { anchorNode } = editor.selection.currentSelectInfo;
                if (anchorNode.id !== block_id) {
                    set_is_show(false);
                    return;
                }
                setTimeout(() => {
                    const searchText =
                        editor.blockHelper.getSearchSlashText(block_id);
                    // check if has search text
                    if (searchText && searchText.startsWith('/')) {
                        set_search_text(searchText.slice(1));
                    } else {
                        set_is_show(false);
                    }
                    if (searchText.length > 6 && !types.length) {
                        set_is_show(false);
                    }
                });
            }
        },
        [editor, is_show, block_id, types]
    );

    const handle_keyup = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            check_if_show_command_menu(event);
            handle_click_others(event);
        },
        [check_if_show_command_menu, handle_click_others]
    );

    const handle_key_down = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.code === 'Escape') {
                set_is_show(false);
            }
        },
        []
    );

    useEffect(() => {
        hooks.addHook(HookType.ON_ROOT_NODE_KEYUP, handle_keyup);
        hooks.addHook(HookType.ON_ROOT_NODE_KEYDOWN_CAPTURE, handle_key_down);

        return () => {
            hooks.removeHook(HookType.ON_ROOT_NODE_KEYUP, handle_keyup);
            hooks.removeHook(
                HookType.ON_ROOT_NODE_KEYDOWN_CAPTURE,
                handle_key_down
            );
        };
    }, [handle_keyup, handle_key_down, hooks]);

    const handle_click_away = () => {
        set_is_show(false);
    };

    const handle_selected = async (type: BlockFlavorKeys | string) => {
        const text = await editor.commands.textCommands.getBlockText(block_id);
        editor.blockHelper.removeSearchSlash(block_id, true);
        if (type.startsWith('Virgo')) {
            const handler =
                commandMenuHandlerMap[Protocol.Block.Type.reference];
            handler(block_id, type, editor);
        } else if (text.length > 1) {
            const handler = commandMenuHandlerMap[type];
            if (handler) {
                await handler(block_id, type, editor);
            } else {
                await commonCommandMenuHandler(block_id, type, editor);
            }
            const block = await editor.getBlockById(block_id);
            block.remove();
        } else {
            if (Protocol.Block.Type[type as BlockFlavorKeys]) {
                const block = await editor.commands.blockCommands.convertBlock(
                    block_id,
                    type as BlockFlavorKeys
                );
                block.firstCreateFlag = true;
            }
        }
        set_is_show(false);
    };

    const handle_close = () => {
        editor.blockHelper.removeSearchSlash(block_id);
    };

    return (
        <div
            className={styles('commandMenu')}
            onKeyUpCapture={handle_keyup}
            ref={commandMenuContentRef}
        >
            <MuiClickAwayListener onClickAway={handle_click_away}>
                {/* MuiClickAwayListener  渲染子节点问题*/}
                <div>
                    <CommandMenuContainer
                        editor={editor}
                        hooks={hooks}
                        style={{
                            ...commandMenuPosition,
                            ...style,
                        }}
                        isShow={is_show}
                        blockId={block_id}
                        onSelected={handle_selected}
                        onclose={handle_close}
                        searchBlocks={search_blocks}
                        types={types}
                        categories={categories}
                    />
                </div>
            </MuiClickAwayListener>
        </div>
    );
};

const styles = style9.create({
    commandMenu: {
        position: 'absolute',
        zIndex: 1,
    },
});
