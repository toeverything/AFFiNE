import { CommonListItem } from '@toeverything/components/common';
import { AddIcon } from '@toeverything/components/icons';
import {
    Input,
    ListButton,
    MuiClickAwayListener,
    MuiGrow as Grow,
    MuiPaper as Paper,
    MuiPopper as Popper,
    styled,
} from '@toeverything/components/ui';
import { services } from '@toeverything/datasource/db-service';
import { HookType, PluginHooks, Virgo } from '@toeverything/framework/virgo';
import React, {
    ChangeEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useParams } from 'react-router-dom';
import { QueryBlocks, QueryResult } from '../../search';
import { DoubleLinkMenuContainer } from './Container';

const ADD_NEW_SUB_PAGE = 'AddNewSubPage';
const ADD_NEW_PAGE = 'AddNewPage';
const ARRAY_CODES = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'];

export type DoubleLinkMenuProps = {
    editor: Virgo;
    hooks: PluginHooks;
    style?: { left: number; top: number };
};

type DoubleLinkMenuStyle = {
    left: number;
    top: number;
    height: number;
};

export const DoubleLinkMenu = ({
    editor,
    hooks,
    style,
}: DoubleLinkMenuProps) => {
    const { page_id: curPageId } = useParams();
    const [isOpen, setIsOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState(null);
    const dialogRef = useRef<HTMLDivElement>();
    const newPageSearchRef = useRef<HTMLInputElement>();
    const [doubleLinkMenuStyle, setDoubleLinkMenuStyle] =
        useState<DoubleLinkMenuStyle>({
            left: 0,
            top: 0,
            height: 0,
        });

    const [curBlockId, setCurBlockId] = useState<string>();
    const [searchText, setSearchText] = useState<string>();
    const [inAddNewPage, setInAddNewPage] = useState(false);
    const [filterText, setFilterText] = useState<string>('');
    const [searchResultBlocks, setSearchResultBlocks] = useState<QueryResult>(
        []
    );

    const menuTypes = useMemo(() => {
        return Object.values(searchResultBlocks)
            .map(({ id }) => id)
            .concat([ADD_NEW_SUB_PAGE, ADD_NEW_PAGE]);
    }, [searchResultBlocks]);

    const menuItems: CommonListItem[] = useMemo(() => {
        const items: CommonListItem[] = [];
        if (searchResultBlocks?.length > 0) {
            items.push({
                renderCustom: () => {
                    return (
                        <ListButton
                            content={
                                inAddNewPage ? 'SUGGESTED' : 'LINK TO PAGE'
                            }
                        />
                    );
                },
            });
            items.push(
                ...(searchResultBlocks?.map(
                    block =>
                        ({
                            block: {
                                ...block,
                                content: block.content || 'Untitled',
                            },
                        } as CommonListItem)
                ) || [])
            );
        }

        if (items.length > 0) {
            items.push({ divider: 'newPage' });
        }
        items.push({
            content: {
                id: ADD_NEW_SUB_PAGE,
                content: 'Add new sub-page',
                icon: AddIcon,
            },
        });
        // !inAddNewPage &&
        //     items.push({
        //         content: {
        //             id: ADD_NEW_PAGE,
        //             content: 'Add new page in...',
        //             icon: AddIcon,
        //         },
        //     });
        return items;
    }, [searchResultBlocks, inAddNewPage]);

    useEffect(() => {
        const text = inAddNewPage ? filterText : searchText;
        QueryBlocks(editor, text, result => {
            if (!inAddNewPage) {
                result = result.filter(item => item.id !== curPageId);
            }
            setSearchResultBlocks(result);
        });
    }, [editor, searchText, filterText, inAddNewPage, curPageId]);

    const hideMenu = useCallback(() => {
        setIsOpen(false);
        setInAddNewPage(false);
        editor.blockHelper.removeDoubleLinkSearchSlash(curBlockId);
        editor.scrollManager.unLock();
    }, [curBlockId, editor]);

    const resetState = useCallback(
        (preNodeId: string, nextNodeId: string) => {
            preNodeId &&
                editor.blockHelper.removeDoubleLinkSearchSlash(preNodeId);
            setCurBlockId(nextNodeId);
            setSearchText('');
            setIsOpen(true);
            editor.scrollManager.lock();
            const clientRect =
                editor.selection.currentSelectInfo?.browserSelection
                    ?.getRangeAt(0)
                    ?.getBoundingClientRect();
            if (clientRect) {
                const rectTop = clientRect.top;
                const { top, left } = editor.container.getBoundingClientRect();
                setDoubleLinkMenuStyle({
                    top: rectTop - top,
                    left: clientRect.left - left,
                    height: clientRect.height,
                });
                setAnchorEl(dialogRef.current);
            }
            const textSelection = editor.blockHelper.selectionToSlateRange(
                nextNodeId,
                editor.selection.currentSelectInfo?.browserSelection
            );
            if (textSelection) {
                const { anchor } = textSelection;
                editor.blockHelper.setDoubleLinkSearchSlash(nextNodeId, anchor);
            }
        },
        [editor]
    );

    const searchChange = useCallback(
        async (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (ARRAY_CODES.includes(event.code)) {
                return;
            }
            if (event.code === 'Backspace') {
                const searchText =
                    editor.blockHelper.getDoubleLinkSearchSlashText(curBlockId);
                if (!searchText || searchText === '[[') {
                    hideMenu();
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
            }
            const { type, anchorNode } = editor.selection.currentSelectInfo;
            if (!anchorNode) {
                return;
            }
            if (
                !isOpen ||
                (type === 'Range' &&
                    anchorNode.id !== curBlockId &&
                    editor.blockHelper.isSelectionCollapsed(anchorNode.id))
            ) {
                const text =
                    editor.blockHelper.getBlockTextBeforeSelection(
                        anchorNode.id
                    ) || '';
                if (text.endsWith('[[')) {
                    resetState(curBlockId, anchorNode.id);
                }
            }
            if (isOpen) {
                const searchText =
                    editor.blockHelper.getDoubleLinkSearchSlashText(curBlockId);
                if (searchText && searchText.startsWith('[[')) {
                    setSearchText(searchText.slice(2).trim());
                }
            }
        },
        [editor, isOpen, curBlockId, hideMenu, resetState]
    );

    const handleKeyup = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => searchChange(event),
        [searchChange]
    );

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (!isOpen) {
                return;
            }
            if (event.code === 'Escape') {
                hideMenu();
            }

            if (event.code === 'Backspace') {
                const searchText =
                    editor.blockHelper.getDoubleLinkSearchSlashText(curBlockId);
                if (!searchText || searchText === '[[') {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
            }
        },
        [hideMenu, editor, isOpen, curBlockId]
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

    useEffect(() => {
        const showDoubleLink = () => {
            const { anchorNode } = editor.selection.currentSelectInfo;
            editor.blockHelper.insertNodes(anchorNode.id, [{ text: '[[' }], {
                select: true,
            });
            setTimeout(() => {
                resetState('', anchorNode.id);
            }, 0);
        };
        editor.plugins.observe('showDoubleLink', showDoubleLink);
        return () => editor.plugins.unobserve('showDoubleLink', showDoubleLink);
    }, [editor, resetState]);

    const insertDoubleLink = useCallback(
        async (pageId: string) => {
            editor.blockHelper.setSelectDoubleLinkSearchSlash(curBlockId);
            await editor.blockHelper.insertDoubleLink(
                editor.workspace,
                pageId,
                curBlockId
            );
            hideMenu();
        },
        [editor, curBlockId, hideMenu]
    );

    const addSubPage = useCallback(
        async (parentPageId: string) => {
            const newPage = await services.api.editorBlock.create({
                workspace: editor.workspace,
                type: 'page' as const,
            });
            services.api.editorBlock.update({
                id: newPage.id,
                workspace: editor.workspace,
                properties: {
                    text: { value: [{ text: searchText }] },
                },
            });
            await services.api.pageTree.addChildPageToWorkspace(
                editor.workspace,
                parentPageId,
                newPage.id
            );
            return newPage.id;
        },
        [searchText, editor]
    );

    const handleSelected = async (id: string) => {
        if (curBlockId) {
            if (id === ADD_NEW_PAGE) {
                setInAddNewPage(true);
                setTimeout(() => {
                    newPageSearchRef.current?.focus();
                });
                return;
            }
            if (id === ADD_NEW_SUB_PAGE) {
                const pageId = await addSubPage(curPageId);
                insertDoubleLink(pageId);
                return;
            }
            if (inAddNewPage) {
                const pageId = await addSubPage(id);
                insertDoubleLink(pageId);
            } else {
                insertDoubleLink(id);
            }
        }
    };

    const handleFilterChange = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            const text = e.target.value;

            await setFilterText(text);
        },
        []
    );

    return (
        <div
            ref={dialogRef}
            style={{
                position: 'absolute',
                width: '10px',
                ...doubleLinkMenuStyle,
            }}
        >
            {isOpen && (
                <MuiClickAwayListener onClickAway={() => hideMenu()}>
                    <Popper
                        open={isOpen}
                        anchorEl={anchorEl}
                        transition
                        placement="bottom-start"
                    >
                        {({ TransitionProps }) => (
                            <Grow
                                {...TransitionProps}
                                style={{
                                    transformOrigin: 'left bottom',
                                }}
                            >
                                <Paper>
                                    {inAddNewPage && (
                                        <NewPageSearchContainer>
                                            <Input
                                                ref={newPageSearchRef}
                                                value={filterText}
                                                onChange={handleFilterChange}
                                                placeholder="Search page to add to..."
                                            />
                                        </NewPageSearchContainer>
                                    )}
                                    <DoubleLinkMenuContainer
                                        editor={editor}
                                        hooks={hooks}
                                        style={style}
                                        blockId={curBlockId}
                                        onSelected={handleSelected}
                                        onClose={hideMenu}
                                        items={menuItems}
                                        types={menuTypes}
                                    />
                                </Paper>
                            </Grow>
                        )}
                    </Popper>
                </MuiClickAwayListener>
            )}
        </div>
    );
};
const NewPageSearchContainer = styled('div')({
    padding: '8px 8px 0px 8px',
});
