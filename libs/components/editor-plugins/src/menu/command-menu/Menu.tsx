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
import { QueryResult } from '../../search';

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

const COMMAND_MENU_HEIGHT = 509;

export const CommandMenu = ({ editor, hooks, style }: CommandMenuProps) => {
    const [show, setShow] = useState(false);
    const [blockId, setBlockId] = useState<string>();
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
                        setBlockId(anchorNode.id);
                        editor.blockHelper.removeSearchSlash(blockId);
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
                        setShow(true);
                        const rect =
                            editor.selection.currentSelectInfo?.browserSelection
                                ?.getRangeAt(0)
                                ?.getBoundingClientRect();
                        if (rect) {
                            let top = rect.top;
                            const clientHeight =
                                document.documentElement.clientHeight;

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
        [editor, blockId]
    );

    const handle_click_others = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (show) {
                const { anchorNode } = editor.selection.currentSelectInfo;
                if (anchorNode.id !== blockId) {
                    setShow(false);
                    return;
                }
                setTimeout(() => {
                    const searchText =
                        editor.blockHelper.getSearchSlashText(blockId);
                    // check if has search text
                    if (searchText && searchText.startsWith('/')) {
                        set_search_text(searchText.slice(1));
                    } else {
                        setShow(false);
                    }
                    if (searchText.length > 6 && !types.length) {
                        setShow(false);
                    }
                });
            }
        },
        [editor, show, blockId, types]
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
                setShow(false);
            }
        },
        []
    );

    useEffect(() => {
        const sub = hooks
            .get(HookType.ON_ROOT_NODE_KEYUP)
            .subscribe(handle_keyup);
        sub.add(
            hooks
                .get(HookType.ON_ROOT_NODE_KEYDOWN_CAPTURE)
                .subscribe(handle_key_down)
        );

        return () => {
            sub.unsubscribe();
        };
    }, [handle_keyup, handle_key_down, hooks]);

    const handle_click_away = () => {
        setShow(false);
    };

    const handle_selected = async (type: BlockFlavorKeys | string) => {
        const text = await editor.commands.textCommands.getBlockText(blockId);
        editor.blockHelper.removeSearchSlash(blockId, true);
        if (type.startsWith('Virgo')) {
            const handler =
                commandMenuHandlerMap[Protocol.Block.Type.reference];
            handler(blockId, type, editor);
        } else if (text.length > 1) {
            const handler = commandMenuHandlerMap[type];
            if (handler) {
                await handler(blockId, type, editor);
            } else {
                await commonCommandMenuHandler(blockId, type, editor);
            }
            const block = await editor.getBlockById(blockId);
            block.remove();
        } else {
            if (Protocol.Block.Type[type as BlockFlavorKeys]) {
                const block = await editor.commands.blockCommands.convertBlock(
                    blockId,
                    type as BlockFlavorKeys
                );
                block.firstCreateFlag = true;
            }
        }
        setShow(false);
    };

    const handle_close = () => {
        editor.blockHelper.removeSearchSlash(blockId);
    };

    return (
        <div
            className={styles('commandMenu')}
            onKeyUpCapture={handle_keyup}
            ref={commandMenuContentRef}
        >
            <MuiClickAwayListener onClickAway={handle_click_away}>
                <div>
                    <CommandMenuContainer
                        editor={editor}
                        hooks={hooks}
                        style={{
                            ...commandMenuPosition,
                            ...style,
                        }}
                        isShow={show}
                        blockId={blockId}
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
