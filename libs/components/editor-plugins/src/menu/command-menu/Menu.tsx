import { BlockFlavorKeys, Protocol } from '@toeverything/datasource/db-service';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

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

export const CommandMenu = ({ editor, hooks, style }: CommandMenuProps) => {
    const [show, setShow] = useState(false);
    const [blockId, setBlockId] = useState<string>();
    const [commandMenuPosition, setCommandMenuPosition] =
        useState<CommandMenuPosition>({
            left: 0,
            top: 0,
            bottom: 0,
        });

    const [searchText, setSearchText] = useState<string>('');
    const [searchBlocks, setSearchBlocks] = useState<QueryResult>([]);
    const commandMenuContentRef = useRef();
    // TODO: Two-way link to be developed
    // useEffect(() => {
    //     QueryBlocks(editor, searchText, result => set_searchBlocks(result));
    // }, [editor, searchText]);

    const hideMenu = () => {
        setShow(false);
        editor.scrollManager.unLock();
    };
    const [types, categories] = useMemo(() => {
        const types: Array<BlockFlavorKeys | string> = [];
        const categories: Array<CommandMenuCategories> = [];
        if (searchBlocks.length) {
            Object.values(searchBlocks).forEach(({ id }) => types.push(id));
            categories.push(CommandMenuCategories.pages);
        }
        Object.entries(menuItemsMap).forEach(([category, itemInfoList]) => {
            itemInfoList.forEach(info => {
                if (
                    !searchText ||
                    info.text.toLowerCase().includes(searchText.toLowerCase())
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
    }, [searchBlocks, searchText]);

    const checkIfShowCommandMenu = useCallback(
        async (event: React.KeyboardEvent<HTMLDivElement>) => {
            const { type, anchorNode } = editor.selection.currentSelectInfo;
            // console.log(await editor.getBlockById(anchorNode.id));
            const activeBlock = await editor.getBlockById(anchorNode.id);
            if (activeBlock.type === Protocol.Block.Type.page) {
                return;
            }
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
                        setSearchText('');
                        setShow(true);
                        editor.scrollManager.lock();
                        const rect =
                            editor.selection.currentSelectInfo?.browserSelection
                                ?.getRangeAt(0)
                                ?.getBoundingClientRect();
                        if (rect) {
                            let rectTop = rect.top;
                            const clientHeight =
                                document.documentElement.clientHeight;

                            const COMMAND_MENU_HEIGHT =
                                window.innerHeight * 0.4;
                            const { top, left } =
                                editor.container.getBoundingClientRect();
                            if (clientHeight - rectTop <= COMMAND_MENU_HEIGHT) {
                                setCommandMenuPosition({
                                    left: rect.left - left,
                                    bottom: rectTop - top + 10,
                                    top: 'initial',
                                });
                            } else {
                                setCommandMenuPosition({
                                    left: rect.left - left,
                                    top: rectTop - top + 24,
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

    const handleClickOthers = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (show) {
                const { anchorNode } = editor.selection.currentSelectInfo;
                if (anchorNode.id !== blockId) {
                    hideMenu();
                    return;
                }
                setTimeout(() => {
                    const searchText =
                        editor.blockHelper.getSearchSlashText(blockId);
                    // check if has search text
                    if (searchText && searchText.startsWith('/')) {
                        setSearchText(searchText.slice(1));
                    } else {
                        hideMenu();
                    }
                    if (searchText.length > 6 && !types.length) {
                        hideMenu();
                    }
                });
            }
        },
        [editor, show, blockId, types]
    );

    const handleKeyup = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            checkIfShowCommandMenu(event);
            handleClickOthers(event);
        },
        [checkIfShowCommandMenu, handleClickOthers]
    );

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.code === 'Escape') {
                hideMenu();
            }
        },
        []
    );

    useEffect(() => {
        const sub = hooks
            .get(HookType.ON_ROOT_NODE_KEYUP)
            .subscribe(handleKeyup);
        sub.add(
            hooks
                .get(HookType.ON_ROOT_NODE_KEYDOWN_CAPTURE)
                .subscribe(handleKeyDown)
        );

        return () => {
            sub.unsubscribe();
        };
    }, [handleKeyup, handleKeyDown, hooks]);

    const handleClickAway = () => {
        hideMenu();
    };

    const handleSelected = async (type: BlockFlavorKeys | string) => {
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
        hideMenu();
    };

    const handleClose = () => {
        editor.blockHelper.removeSearchSlash(blockId);
    };

    return (
        <div
            style={{ zIndex: 1 }}
            onKeyUpCapture={handleKeyup}
            ref={commandMenuContentRef}
        >
            {show ? (
                <MuiClickAwayListener onClickAway={handleClickAway}>
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
                            onSelected={handleSelected}
                            onclose={handleClose}
                            searchBlocks={searchBlocks}
                            types={types}
                            categories={categories}
                        />
                    </div>
                </MuiClickAwayListener>
            ) : (
                <></>
            )}
        </div>
    );
};
