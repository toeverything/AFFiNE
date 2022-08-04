import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
    useCallback,
    KeyboardEvent,
    MouseEvent,
    memo,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import isUrl from 'is-url';
import style9 from 'style9';
import {
    Editor,
    Transforms,
    Element as SlateElement,
    Descendant,
    Range as SlateRange,
    Node,
} from 'slate';
import { ReactEditor } from 'slate-react';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditIcon from '@mui/icons-material/Edit';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import AttachmentIcon from '@mui/icons-material/Attachment';
import {
    MuiTooltip as Tooltip,
    styled,
    muiTooltipClasses,
    type MuiTooltipProps,
} from '@toeverything/components/ui';
import {
    getRelativeUrlForInternalPageUrl,
    isInternalPageUrl,
} from '@toeverything/utils';

import { getRandomString } from '../utils';
import { colors } from '../../colors';

export type LinkElement = {
    type: 'link';
    url: string;
    children: Descendant[];
    id: string;
};

export const withLinks = (editor: ReactEditor) => {
    const { isInline } = editor;

    editor.isInline = element => {
        // @ts-ignore
        return element.type === 'link' ? true : isInline(element);
    };

    return editor;
};

const unwrapLink = (editor: Editor) => {
    Transforms.unwrapNodes(editor, {
        match: n => {
            return (
                !Editor.isEditor(n) &&
                SlateElement.isElement(n) &&
                // @ts-expect-error
                n.type === 'link'
            );
        },
    });
};

export const wrapLink = (
    editor: ReactEditor,
    url: string,
    preSelection?: SlateRange
) => {
    if (!ReactEditor.isFocused(editor) && preSelection) {
        Transforms.select(editor, preSelection);
    }
    if (isLinkActive(editor)) {
        unwrapLink(editor);
    }
    const realUrl = normalizeUrl(url);
    const { selection } = editor;
    const isCollapsed = selection && SlateRange.isCollapsed(selection);
    const link: LinkElement = {
        type: 'link',
        url: realUrl,
        children: isCollapsed ? [{ text: realUrl }] : [],
        id: getRandomString('link'),
    };

    if (isCollapsed) {
        Transforms.insertNodes(editor, link as Node);
    } else {
        Transforms.wrapNodes(editor, link, { split: true });
        Transforms.collapse(editor, { edge: 'end' });
    }
    requestAnimationFrame(() => {
        ReactEditor.focus(editor);
    });
};

const normalizeUrl = (url: string) => {
    // eslint-disable-next-line no-restricted-globals
    return /^https?/.test(url) ? url : `${location.protocol}//${url}`;
};

const isLinkActive = (editor: ReactEditor) => {
    const [link] = Editor.nodes(editor, {
        match: n =>
            !Editor.isEditor(n) &&
            SlateElement.isElement(n) &&
            // @ts-expect-error
            n.type === 'link',
    });
    return !!link;
};

const LinkStyledTooltip = styled(({ className, ...props }: MuiTooltipProps) => (
    <Tooltip {...props} classes={{ popper: className }} />
))(({ theme }) => ({
    [`& .${muiTooltipClasses.tooltip}`]: {
        backgroundColor: '#fff',
        color: '#4C6275',
        boxShadow: theme.affine.shadows.shadow1,
        fontSize: '14px',
    },
    [`& .MuiTooltip-tooltipPlacementBottom`]: {
        // prevent tooltip disappear as soon as mouse moves
        // margin: 0
    },
}));

export const LinkComponent = ({
    attributes,
    children,
    element,
    editor,
    onLinkModalVisibleChange,
    hideInlineMenu,
}: any) => {
    const navigate = useNavigate();
    const [tooltip_visible, set_tooltip_visible] = useState(false);

    const handle_tooltip_visible_change = useCallback((visible: boolean) => {
        set_tooltip_visible(visible);
    }, []);

    const handle_link_modal_visible_change = useCallback(
        (visible: boolean, url?: string) => {
            onLinkModalVisibleChange(visible, undefined, url);
        },
        [onLinkModalVisibleChange]
    );

    const handle_click_link_text = useCallback(
        (event: React.MouseEvent<HTMLAnchorElement>) => {
            // prevent route to href url
            event.preventDefault();
            event.stopPropagation();

            const { url } = element;

            if (isInternalPageUrl(url)) {
                navigate(getRelativeUrlForInternalPageUrl(url));
            } else {
                const new_window = window.open(url, '_blank');
                if (new_window) {
                    new_window.focus();
                }
            }
        },
        [element, navigate]
    );

    return (
        <LinkStyledTooltip
            open={tooltip_visible}
            onOpen={() => handle_tooltip_visible_change(true)}
            onClose={() => handle_tooltip_visible_change(false)}
            placement="bottom-start"
            title={
                <LinkTooltips
                    url={element.url}
                    id={element.id}
                    editor={editor}
                    onLinkModalVisibleChange={handle_link_modal_visible_change}
                    onVisibleChange={handle_tooltip_visible_change}
                    hideInlineMenu={hideInlineMenu}
                />
            }
        >
            <a
                {...attributes}
                className={styles({
                    linkWrapper: true,
                    linkWrapperHover: tooltip_visible,
                })}
                href={element.url}
            >
                {/* <InlineChromiumBugfix /> */}
                <span onClick={handle_click_link_text}>{children}</span>
                {/* <InlineChromiumBugfix /> */}
            </a>
        </LinkStyledTooltip>
    );
};

type LinkTooltipsProps = {
    /** Uniquely identifies */
    id: string;
    /** The url to which the hyperlink points */
    url: string;
    /** slate instance */
    editor: Editor;
    /** Used to display linkModal */
    onLinkModalVisibleChange: (visible: boolean, url?: string) => void;
    /** used to hide inlinemenu */
    hideInlineMenu: () => void;
    /** visibleChange of the entire tooltips */
    onVisibleChange: (visible: boolean) => void;
};

const LinkTooltips = (props: LinkTooltipsProps) => {
    const {
        id,
        url,
        editor,
        onLinkModalVisibleChange,
        hideInlineMenu,
        onVisibleChange,
    } = props;

    const select_link = useCallback(() => {
        const { children } = editor;
        // @ts-ignore
        const realChildren = children[0]?.children;
        const path = [0];
        let offset = 0;
        if (realChildren && Array.isArray(realChildren)) {
            for (let i = 0; i < realChildren.length; i++) {
                const child = realChildren[i];
                if (child.type === 'link' && child.id === id) {
                    path.push(i);
                    const linkChildren = child.children;
                    path.push(linkChildren.length - 1);
                    offset = linkChildren[linkChildren.length - 1].text.length;
                }
            }
            if (path.length === 3 && offset) {
                const anchor = Editor.before(
                    editor,
                    {
                        path,
                        offset: 0,
                    },
                    {
                        unit: 'offset',
                    }
                );
                const focus = Editor.after(
                    editor,
                    {
                        path,
                        offset,
                    },
                    {
                        unit: 'offset',
                    }
                );
                Transforms.select(editor, { anchor, focus });
                ReactEditor.focus(editor as ReactEditor);
                onVisibleChange(false);
                requestAnimationFrame(() => {
                    hideInlineMenu?.();
                });
                return true;
            }
        }
        return false;
    }, [editor, hideInlineMenu, id, onVisibleChange]);

    const handle_edit_link_url = useCallback(() => {
        const selectSuccess = select_link();

        if (selectSuccess) {
            onVisibleChange(false);
            requestAnimationFrame(() => {
                onLinkModalVisibleChange(true, url);
            });
        }
    }, [onLinkModalVisibleChange, onVisibleChange, select_link, url]);

    const handle_unlink = useCallback(() => {
        const selectSuccess = select_link();
        if (selectSuccess) {
            requestAnimationFrame(() => {
                unwrapLink(editor);
                ReactEditor.deselect(editor);
            });
        }
    }, [editor, select_link]);

    return (
        <div className={styles('linkTooltipContainer')}>
            <span className={styles('linkModalIcon')}>
                <OpenInNewIcon style={{ fontSize: 15 }} />
            </span>
            <span className={styles('linkModalUrl')}>{url}</span>
            <div className={styles('linkModalStick')} />
            <div
                onClick={handle_edit_link_url}
                className={styles('linkModalBtn')}
            >
                <EditIcon style={{ fontSize: 16 }} />
            </div>
            <div onClick={handle_unlink} className={styles('linkModalBtn')}>
                <LinkOffIcon style={{ fontSize: 16 }} />
            </div>
        </div>
    );
};

const InlineChromiumBugfix = () => (
    <span contentEditable={false} style={{ fontSize: 0 }}>
        ${String.fromCodePoint(160)}
    </span>
);

function useBody() {
    const [div] = useState(document.createElement('div'));

    useEffect(() => {
        document.body.appendChild(div);
        return () => {
            div.remove();
        };
    }, []);

    return div;
}

const GAP_BETWEEN_CONTENT_AND_MODAL = 4;

type LinkModalProps = {
    visible: boolean;
    url?: string;
    /** Hide display callback */
    onVisibleChange: (visible: boolean, isInsertLink?: boolean) => void;
    /** Insert link to slate */
    insertLink: (url: string) => void;
};

/**
 * modal for adding and editing link url, input element as content.
 */
export const LinkModal = memo((props: LinkModalProps) => {
    const body = useBody();
    const { visible, onVisibleChange, url = '', insertLink } = props;

    const inputEl = useRef<HTMLInputElement>(null);

    const rect = useMemo(() => {
        return window.getSelection().getRangeAt(0).getClientRects()[0];
    }, []);

    const rects = useMemo(() => {
        return window.getSelection().getRangeAt(0).getClientRects();
    }, []);

    useEffect(() => {
        if (visible) {
            requestAnimationFrame(() => {
                if (url) {
                    inputEl.current.value = url;
                }
                inputEl.current?.focus();
            });
        }
    }, [visible, url]);

    const add_link_url_to_text = () => {
        const newUrl = inputEl.current.value;
        if (newUrl && newUrl !== url && isUrl(normalizeUrl(newUrl))) {
            insertLink(newUrl);
            onVisibleChange(false, true);
            return;
        }
    };

    const handle_key_down = (e: KeyboardEvent<HTMLInputElement>) => {
        // console.log(';; link input keydown ', e.key, e);
        if (e.key === 'Enter') {
            add_link_url_to_text();
        }
        // TODO: FIX unable to catch ESCAPE key down
        if (e.key === 'Escape') {
            onVisibleChange(false);
        }
    };

    const handle_mouse_down = () => {
        onVisibleChange(false);
    };

    const { top, left, height } = rect;

    return createPortal(
        visible && (
            <>
                <LinkBehavior onMousedown={handle_mouse_down} rects={rects} />
                <LinkModalContainer
                    style={{
                        top: top + height + GAP_BETWEEN_CONTENT_AND_MODAL,
                        left,
                    }}
                >
                    <div className={styles('linkModalContainerIcon')}>
                        <AttachmentIcon
                            style={{ color: colors.Gray04, fontSize: 16 }}
                        />
                    </div>
                    <input
                        className={styles('linkModalContainerInput')}
                        onKeyDown={handle_key_down}
                        placeholder="Paste link url, like https://affine.pro"
                        autoComplete="off"
                        ref={inputEl}
                    />
                </LinkModalContainer>
            </>
        ),
        body
    );
});

const LinkBehavior = (props: {
    onMousedown: (e: MouseEvent) => void;
    rects: DOMRectList;
}) => {
    const { onMousedown, rects } = props;

    const ref = useRef<HTMLDivElement>(null);

    const prevent = useCallback((e: any) => {
        // console.log(e);
        // e.preventDefault();
        // e.stopPropagation();
    }, []);

    useEffect(() => {
        document.addEventListener('mousemove', prevent, { capture: true });
        return () => {
            document.removeEventListener('mousemove', prevent, {
                capture: true,
            });
        };
    });

    const renderFakeSelection = useCallback(() => {
        const rectsArr = Array.from(rects);
        if (rectsArr.length) {
            return rectsArr.map((rect, i) => {
                const { top, left, width, height } = rect;
                return (
                    <div
                        key={`fake-selection-${i}`}
                        className={styles('fakeSelection')}
                        style={{ top, left, width, height }}
                    />
                );
            });
        } else {
            return null;
        }
    }, [rects]);

    return (
        <>
            <div
                ref={ref}
                className={styles('linkMask')}
                onMouseDown={onMousedown}
            />
            {renderFakeSelection()}
        </>
    );
};

const LinkModalContainer = styled('div')(({ theme }) => ({
    position: 'fixed',
    width: '354px',
    height: '40px',
    padding: '12px',
    display: 'flex',
    borderRadius: '4px',
    boxShadow: theme.affine.shadows.shadow1,
    backgroundColor: '#fff',
    alignItems: 'center',
    zIndex: '1',
}));

const styles = style9.create({
    linkModalContainerIcon: {
        width: '16px',
        margin: '0 16px 0 4px',
    },
    linkModalContainerInput: {
        flex: '1',
        outline: 'none',
        border: 'none',
        padding: '0',
        fontFamily: 'Helvetica,Arial,"Microsoft Yahei",SimHei,sans-serif',
        '::-webkit-input-placeholder': {
            color: '#98acbd',
        },
    },
    linkMask: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '1',
    },
    fakeSelection: {
        pointerEvents: 'none',
        position: 'fixed',
        // backgroundColor: 'rgba(80, 46, 196, 0.1)',
        zIndex: '1',
    },
    linkWrapper: {
        cursor: 'pointer',
        textDecorationLine: 'none',
    },
    linkWrapperHover: {},
    linkTooltipContainer: {
        // color: 'var(--ligo-Gray04)',
        display: 'flex',
        alignItems: 'center',
    },
    linkModalIcon: {},
    linkModalStick: {
        width: '1px',
        height: '20px',
        margin: '0 10px 0 16px',
    },
    linkModalUrl: {
        marginLeft: '8px',
        maxWidth: '261px',
        textOverflow: 'ellipsis',
        overflowX: 'hidden',
        overflowY: 'hidden',
        whiteSpace: 'nowrap',
    },
    linkModalBtn: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '28px',
        height: '28px',
        transitionProperty: 'background-color',
        transitionDuration: '0.3s',
        borderRadius: '4px',
        ':hover': {
            cursor: 'pointer',
        },
    },
});
