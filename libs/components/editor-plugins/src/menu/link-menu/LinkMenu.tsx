import { CommonListItem, isUrl } from '@toeverything/components/common';
import { LinkIcon } from '@toeverything/components/icons';
import {
    ListButton,
    MuiClickAwayListener,
    MuiGrow as Grow,
    MuiPaper as Paper,
    MuiPopper as Popper,
    styled,
} from '@toeverything/components/ui';
import { PluginHooks, Virgo } from '@toeverything/framework/virgo';
import {
    ChangeEvent,
    KeyboardEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useParams } from 'react-router-dom';
import { QueryBlocks, QueryResult } from '../../search';
import { DoubleLinkMenuContainer } from '../double-link-menu/Container';

const ADD_NEW_SUB_PAGE = 'AddNewSubPage';
const ADD_NEW_PAGE = 'AddNewPage';

export type LinkMenuProps = {
    editor: Virgo;
    hooks: PluginHooks;
};

type LinkMenuStyle = {
    left: number;
    top: number;
    height: number;
};

const normalizeUrl = (url: string) => {
    // eslint-disable-next-line no-restricted-globals
    return /^https?/.test(url) ? url : `${location.protocol}//${url}`;
};

export const LinkMenu = ({ editor, hooks }: LinkMenuProps) => {
    const { page_id: curPageId } = useParams();
    const [isOpen, setIsOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState(null);
    const dialogRef = useRef<HTMLDivElement>();
    const inputEl = useRef<HTMLInputElement>();
    const [linkMenuStyle, setLinkMenuStyle] = useState<LinkMenuStyle>({
        left: 0,
        top: 0,
        height: 0,
    });
    const url = '';

    const [curBlockId, setCurBlockId] = useState<string>();
    const [searchText, setSearchText] = useState<string>();
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
                    return <ListButton content={'LINK TO PAGE'} />;
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
        return items;
    }, [searchResultBlocks]);

    useEffect(() => {
        const text = searchText;
        QueryBlocks(editor, text, result => {
            result = result.filter(item => item.id !== curPageId);
            setSearchResultBlocks(result);
        });
    }, [editor, searchText, curPageId]);

    const hideMenu = useCallback(() => {
        setIsOpen(false);
        editor.blockHelper.removeDoubleLinkSearchSlash(curBlockId);
        editor.scrollManager.unLock();
    }, [curBlockId, editor]);

    const resetState = useCallback(
        (preNodeId: string, nextNodeId: string) => {
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
                setLinkMenuStyle({
                    top: rectTop - top,
                    left: clientRect.left - left,
                    height: clientRect.height,
                });
                setAnchorEl(dialogRef.current);
            }
        },
        [editor]
    );

    useEffect(() => {
        const showDoubleLink = () => {
            const { anchorNode } = editor.selection.currentSelectInfo;
            resetState('', anchorNode.id);
        };
        editor.plugins.observe('showAddLink', showDoubleLink);
        return () => editor.plugins.unobserve('showAddLink', showDoubleLink);
    }, [editor, resetState]);

    const handleSelected = async (id: string) => {
        if (curBlockId) {
        }
    };

    const handleFilterChange = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            const text = e.target.value;

            await setSearchText(text);
        },
        []
    );

    const addLinkUrlToText = () => {
        const newUrl = inputEl.current.value;
        if (newUrl && newUrl !== url && isUrl(normalizeUrl(newUrl))) {
            editor.blockHelper.wrapLink(curBlockId, newUrl);
            hideMenu();
            return;
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            addLinkUrlToText();
        }
        if (e.key === 'Escape') {
            hideMenu();
        }
    };

    return (
        <div
            ref={dialogRef}
            style={{
                position: 'absolute',
                width: '10px',
                ...linkMenuStyle,
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
                                    <LinkModalContainer>
                                        <LinkModalContainerIcon>
                                            <LinkIcon
                                                style={{
                                                    fontSize: '16px',
                                                    marginTop: '2px',
                                                }}
                                            />
                                        </LinkModalContainerIcon>
                                        <LinkModalContainerInput
                                            onKeyDown={handleKeyDown}
                                            placeholder="Paste link url, like https://affine.pro"
                                            autoComplete="off"
                                            value={searchText}
                                            onChange={handleFilterChange}
                                            ref={inputEl}
                                        />
                                    </LinkModalContainer>

                                    {menuItems.length > 0 && (
                                        <DoubleLinkMenuContainer
                                            editor={editor}
                                            hooks={hooks}
                                            blockId={curBlockId}
                                            onSelected={handleSelected}
                                            onClose={hideMenu}
                                            items={menuItems}
                                            types={menuTypes}
                                        />
                                    )}
                                </Paper>
                            </Grow>
                        )}
                    </Popper>
                </MuiClickAwayListener>
            )}
        </div>
    );
};

const LinkModalContainer = styled('div')(({ theme }) => ({
    display: 'flex',
    borderRadius: '4px',
    boxShadow: theme.affine.shadows.shadow1,
    backgroundColor: '#fff',
    alignItems: 'center',
    zIndex: '1',
    width: '354px',
}));

const LinkModalContainerIcon = styled('div')(({ theme }) => ({
    display: 'flex',
    width: '16px',
    margin: '0 16px 0 4px',
    color: '#4C6275',
}));

const LinkModalContainerInput = styled('input')(({ theme }) => ({
    flex: '1',
    outline: 'none',
    border: 'none',
    padding: '8px',
    fontFamily: 'Helvetica,Arial,"Microsoft Yahei",SimHei,sans-serif',
    '::-webkit-input-placeholder': {
        color: '#98acbd',
    },
    color: '#4C6275',
}));
