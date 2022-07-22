/* eslint-disable max-lines */
import React, {
    KeyboardEvent,
    KeyboardEventHandler,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    forwardRef,
    MouseEventHandler,
    useLayoutEffect,
    CSSProperties,
    MouseEvent,
    DragEvent,
} from 'react';
import isHotkey from 'is-hotkey';
import {
    createEditor,
    Descendant,
    Range,
    Element as SlateElement,
    Editor,
    Transforms,
    Node,
    Path,
} from 'slate';
import {
    Editable,
    withReact,
    Slate,
    ReactEditor,
    useSlateStatic,
} from 'slate-react';

import { ErrorBoundary, isEqual, uaHelper } from '@toeverything/utils';

import { Contents, SlateUtils, isSelectAll } from './slate-utils';
import {
    getCommentsIdsOnTextNode,
    getExtraPropertiesFromEditorOutmostNode,
    isInterceptCharacter,
    matchMarkdown,
} from './utils';
import { HOTKEYS, INLINE_STYLES } from './constants';
import { LinkComponent, LinkModal, withLinks, wrapLink } from './plugins/link';
import { withDate, InlineDate } from './plugins/date';
import { CustomElement } from '..';
import isUrl from 'is-url';
import { InlineRefLink } from './plugins/reflink';
import { TextWithComments } from './element-leaf/TextWithComments';

export interface TextProps {
    /** read only */
    readonly?: boolean;
    /** current value */
    currentValue?: CustomElement[];
    /** extra props at editor top level; it's stored at the parent of currentValue */
    textStyle?: Record<string, unknown>;
    /** auto focus */
    autoFocus?: boolean;
    /** id */
    id?: string;
    /** keyDown event, return true, cancel the default behavior */
    handleKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => boolean | undefined;
    /** enter event, return true, cancel the default behavior */
    handleEnter?: ({
        splitContents,
        isShiftKey,
    }: {
        splitContents: Contents;
        isShiftKey: boolean;
    }) => Promise<boolean | undefined> | boolean | undefined;
    /** select event */
    handleSelectAll?: () => void;
    /** select event */
    handleSelect?: (selection: Range) => void;
    /** After text change event, generally used to synchronize model */
    handleChange?: (
        value: SlateElement[],
        textStyle?: Record<string, unknown>
    ) => void;
    /** tab event, return true, cancel the default behavior */
    handleTab?: ({
        isShiftKey,
    }: {
        isShiftKey: boolean;
    }) => boolean | undefined | Promise<boolean | undefined>;
    /** Backspace event */
    handleBackSpace?: ({
        isCollAndStart,
    }: {
        isCollAndStart: boolean;
    }) => boolean | undefined | Promise<boolean | undefined>;
    /** Whether markdown is supported */
    supportMarkdown?: boolean;
    /** Whether to support inline linking */
    supportLink?: boolean;
    /** Whether to show placeholder all the time */
    alwaysShowPlaceholder?: boolean;
    /** placeholder */
    placeholder?: string;
    /** Convert Block API */
    handleConvert?: (type: string, options?: Record<string, unknown>) => void;
    /** undo */
    handleUndo?: () => void;
    /** redo */
    handleRedo?: () => void;
    /** up button */
    handleUp?: (event: KeyboardEvent) => boolean | undefined | Promise<boolean>;
    /** down button */
    handleDown?: (
        event: KeyboardEvent
    ) => boolean | undefined | Promise<boolean>;
    /** left button */
    handleLeft?: () => boolean | undefined | Promise<boolean>;
    /** right button */
    handleRight?: () => boolean | undefined | Promise<boolean>;
    /** press / */
    handleSlash?: () => void;
    /** Click event, fired after select */
    handleClick?: MouseEventHandler<HTMLDivElement>;
    handleMouseDown?: MouseEventHandler<HTMLDivElement>;
    /** No need to synchronize the model's change event */
    handleTextChange?: (value: SlateElement[]) => void;
    /** esc */
    handleEsc?: () => void;
    /** focus */
    handleFocus?: (selection: Range) => void;
    handleBlur?: (selection: Range) => void;
    /** hide inlinemenu */
    hideInlineMenu?: () => void;
    /** Whether as a pure controlled component */
    isControlled?: boolean;
    /** The dataset that needs to be added to the text-paragraph dom is initialized and used, and changes are not supported */
    paragraphDataSets?: string[];
    /** class */
    className?: string;
    style?: CSSProperties;
    /** if return true prevent the default slate copy */
    handleCopy?: () => boolean | undefined | Promise<boolean>;
}
type ExtendedTextUtils = SlateUtils & {
    setLinkModalVisible: (visible: boolean) => void;
};

// @refresh reset
export const Text = forwardRef<ExtendedTextUtils, TextProps>((props, ref) => {
    const {
        currentValue = [],
        textStyle = {},
        readonly = false,
        id,
        handleKeyDown,
        handleEnter,
        handleSelectAll,
        handleSelect,
        handleChange,
        handleTab,
        handleBackSpace,
        handleConvert,
        handleRedo,
        handleUndo,
        handleUp,
        handleLeft,
        handleRight,
        handleTextChange,
        handleDown,
        handleClick,
        handleMouseDown,
        handleEsc,
        handleSlash,
        handleFocus,
        handleBlur,
        handleCopy,
        hideInlineMenu,
        className,
        supportMarkdown = true,
        supportLink = true,
        alwaysShowPlaceholder = false,
        placeholder = '',
        autoFocus = false,
        isControlled = false,
        paragraphDataSets = [],
        style,
    } = props;

    /** forceupdate */
    const [updateTimes, forceUpdate] = useState<number>(0);

    /** placeholder */
    const [showPlaceholder, setShowPlaceholder] = useState<boolean>(
        () => alwaysShowPlaceholder
    );

    /** Whether linkModal is displayed */
    const [linkModalVisible, setLinkModalVisible] = useState<boolean>(false);

    /** linkUrl */
    const [linkUrl, setLinkUrl] = useState<string>('');

    /** The selection area through blur deselect is used to restore the selection area */
    const previous_selection_from_on_blur_ref = useRef<Range>(null);

    const focused = useRef(false);

    const editor = useMemo(
        () => withDate(withLinks(withReact(createEditor() as ReactEditor))),
        []
    );

    useLayoutEffect(() => {
        const newVal = createSlateText(currentValue, textStyle);
        if (!isEqual(editor.children, newVal)) {
            editor.children = newVal;
            forceUpdate(v => v + 1);
        }
    }, [currentValue, editor, textStyle]);

    const onLinkModalVisibleChange = useCallback(
        (visible: boolean, isInsertLink?: boolean, url?: string) => {
            setLinkModalVisible(visible);
            if (url) {
                setLinkUrl(url);
            }
            if (!isInsertLink && previous_selection_from_on_blur_ref.current) {
                Transforms.select(
                    editor,
                    previous_selection_from_on_blur_ref.current
                );
                requestAnimationFrame(() => {
                    ReactEditor.focus(editor);
                });
            }
        },
        []
    );

    const renderElement = useCallback(
        (props: any) => {
            return (
                <EditorElement
                    {...props}
                    editor={editor}
                    onLinkModalVisibleChange={onLinkModalVisibleChange}
                    hideInlineMenu={hideInlineMenu}
                    paragraphDataSets={paragraphDataSets}
                    id={id}
                />
            );
        },
        [
            editor,
            hideInlineMenu,
            id,
            onLinkModalVisibleChange,
            paragraphDataSets,
        ]
    );

    const renderLeaf = useCallback((props: any) => {
        return <EditorLeaf {...props} />;
    }, []);

    const utils = useRef<SlateUtils>(null);

    const resetSelectionIfNeeded = () => {
        if (
            currentValue &&
            Array.isArray(currentValue) &&
            utils.current &&
            editor.selection
        ) {
            const { selectionEnd } = utils.current.getSelectionStartAndEnd();
            const end = currentValue[currentValue.length - 1];
            if ('text' in end) {
                const endOffset = end.text.length;
                if (selectionEnd.offset > end.text.length) {
                    utils.current.setSelection({
                        focus: {
                            path: selectionEnd.path,
                            offset: endOffset,
                        },
                        anchor: {
                            path: selectionEnd.path,
                            offset: endOffset,
                        },
                    });
                }
            }
        }
    };

    useEffect(() => {
        if (!utils.current) {
            utils.current = new SlateUtils(editor);
            if (ref && 'current' in ref) {
                ref.current = utils.current as ExtendedTextUtils;
                ref.current.setLinkModalVisible = setLinkModalVisible;
            }
        }
        if (autoFocus) {
            utils.current.focus();
        }
        return () => {
            utils.current.dispose();
            utils.current = null;
        };
    }, []);

    const onKeyDown: KeyboardEventHandler<HTMLDivElement> = e => {
        const shouldPreventDefault = handleKeyDown && handleKeyDown(e);
        if (shouldPreventDefault) {
            e.preventDefault();
            return;
        }
        if (e.metaKey && e.key === 'a') {
            e.stopPropagation();
            if (isSelectAll(editor)) {
                e.preventDefault();
                handleSelectAll && handleSelectAll();
            }
        }

        if (e.metaKey && e.key === 'z') {
            if (e.shiftKey) {
                // redo
                handleRedo && handleRedo();
            } else {
                // undo
                handleUndo && handleUndo();
            }
            e.preventDefault();
            return;
        }
        if (e.code === 'ShiftLeft') {
            return;
        }
        // https://github.com/facebook/react/issues/13104
        if (!e.nativeEvent.isComposing) {
            switch (e.code) {
                case 'Enter': {
                    onEnter(e);
                    break;
                }
                case 'Tab': {
                    onTab(e);
                    break;
                }
                case 'Backspace': {
                    onBackSpace(e);
                    break;
                }
                case 'ArrowUp': {
                    e.stopPropagation();
                    onUp(e);
                    break;
                }
                case 'ArrowDown': {
                    e.stopPropagation();
                    onDown(e);
                    break;
                }
                case 'ArrowRight': {
                    e.stopPropagation();
                    onRight(e);
                    break;
                }
                case 'ArrowLeft': {
                    e.stopPropagation();
                    onLeft(e);
                    break;
                }
                case 'Digit2': {
                    break;
                }
                case 'Escape': {
                    e.stopPropagation();
                    handleEsc?.();
                }
            }
        }
        handle_hotkey_if_needed(e);
    };

    const handle_hotkey_if_needed = (e: KeyboardEvent) => {
        for (const hotkey in HOTKEYS) {
            if (isHotkey(hotkey, e)) {
                e.preventDefault();
                const mark = HOTKEYS[hotkey as keyof typeof HOTKEYS];
                if (mark === 'link' && supportLink) {
                    setLinkModalVisible(true);
                    hideInlineMenu?.();
                    return;
                }
                toggleMark(editor, mark);
            }
        }
    };

    const isMarkActive = (editor: ReactEditor, format: string) => {
        const marks: any = Editor.marks(editor);
        return marks ? marks[format] === true : false;
    };

    const toggleMark = (editor: ReactEditor, format: string) => {
        const isActive = isMarkActive(editor, format);

        if (isActive) {
            Editor.removeMark(editor, format);
        } else {
            Editor.addMark(editor, format, true);
        }
    };

    const onSlash = () => {
        handleSlash && handleSlash();
    };

    const onDown = (e: KeyboardEvent) => {
        e.stopPropagation();
        preventBindIfNeeded(handleDown)(e, e);
    };

    const onUp = (e: KeyboardEvent) => {
        e.stopPropagation();
        preventBindIfNeeded(handleUp)(e, e);
    };
    const onRight = (e: KeyboardEvent) => {
        preventBindIfNeeded(handleRight)(e);
    };
    const onLeft = (e: KeyboardEvent) => {
        preventBindIfNeeded(handleLeft)(e);
    };

    const onEnter = (e: KeyboardEvent) => {
        if (!editor.selection) {
            return;
        }
        if (!e.isDefaultPrevented()) {
            const splitContents = utils.current.getSplitContentsBySelection();
            preventBindIfNeeded(handleEnter)(e, {
                splitContents,
                isShiftKey: !!e.shiftKey,
            });
            // TODO: When re-rendering, onSelect will be triggered again, resulting in the wrong cursor position in the list after carriage return, so manual blur is required, but some cases cannot be manually blurred
            if (
                !Range.equals(
                    editor.selection,
                    utils.current.getStartSelection()
                ) &&
                !e.shiftKey
            ) {
                ReactEditor.blur(editor);
            }
        }
    };

    const onBackSpace = (e: KeyboardEvent) => {
        if (!editor.selection) {
            return;
        }
        const isCool = utils.current.isCollapsed();
        const isCollAndStart = utils.current.isStart() && isCool;
        if (!isCool) {
            hideInlineMenu && hideInlineMenu();
        }
        preventBindIfNeeded(handleBackSpace)(e, { isCollAndStart });
    };

    const onTab = (e: KeyboardEvent) => {
        if (!editor.selection) {
            return;
        }
        preventBindIfNeeded(handleTab)(e, { isShiftKey: !!e.shiftKey });
    };

    const onSelect = () => {
        handleSelect && handleSelect(editor.selection);
    };

    const onChange = (newValue: Descendant[]) => {
        if (newValue?.[0] && 'children' in newValue[0]) {
            const children = [...newValue[0].children];
            handleChange &&
                handleChange(
                    children,
                    getExtraPropertiesFromEditorOutmostNode(newValue[0])
                );
            if (!isEqual(children, currentValue)) {
                handleTextChange && handleTextChange(children);
            }
        }

        // https://github.com/ianstormtaylor/slate/issues/2434
        const nowFocus = ReactEditor.isFocused(editor);

        if (!focused.current && nowFocus) {
            if (!alwaysShowPlaceholder) {
                setShowPlaceholder(true);
            }
            handleFocus?.(editor.selection);
        }

        focused.current = nowFocus;
    };

    const onBeforeInput = (e: InputEvent): boolean => {
        // Paste does not follow the default logic
        if (e.inputType === 'insertFromPaste') {
            e.preventDefault();
            return true;
        }
        if (isControlled) {
            // TODO: must be changed to controlled component
            return false;
        }
        if (e.data === '/') {
            onSlash && onSlash();
            return false;
        }
        // link interception
        if (
            supportLink &&
            e.dataTransfer != null &&
            e.dataTransfer.files.length === 0
        ) {
            const { selection } = editor;
            const text = e.dataTransfer.getData('text');
            if (
                isUrl(text) &&
                selection.anchor.offset !== selection.focus.offset
            ) {
                insertLink(text);
                e.preventDefault();
                return true;
            }
        }
        // markdown interception
        if (supportMarkdown && !!handleMarkdown(e)) {
            const start_selection = utils.current.getStartSelection();
            utils.current.setSelection(start_selection);
            e.preventDefault();
            return true;
        }
        if (handleSoftEnter(e)) {
            e.preventDefault();
            return true;
        }
        return false;
    };

    const handleSoftEnter = (e: InputEvent) => {
        if (e.inputType === 'insertLineBreak') {
            // slate directly insertBreak inserts a new paragraph here, we need to insert a real linebreaker
            Editor.insertText(editor, '\n');
            return true;
        }
        return false;
    };

    const handleMarkdown = (e: InputEvent) => {
        /**
         * 1. Detected that a suspected markdown logo was entered
         * 2. Further detect whether the line contains markdown syntax, whether or not a newline
         * 3. If it contains markdown syntax, find out the path that should be converted
         * 4. Convert the content of path to the corresponding format
         */
        if (supportMarkdown && isInterceptCharacter(e.data)) {
            const strToBeTested = `${utils.current.getStringBetweenStartAndSelection()}`;
            const matchRes = matchMarkdown(strToBeTested);
            if (matchRes) {
                if (INLINE_STYLES.includes(matchRes.style)) {
                    const pointsRes = utils.current.getPathOfString(matchRes);
                    if (pointsRes) {
                        const { startLength } = matchRes;
                        const { startPoint, endPoint, style } = pointsRes;
                        utils.current.turnStyleBetweenPoints(
                            startPoint,
                            endPoint,
                            style,
                            startLength
                        );
                    }
                } else {
                    // get rid of the syntax first
                    const { style, startLength } = matchRes;
                    console.log('startLength', startLength);
                    const start = Editor.after(
                        editor,
                        utils.current.getStart(),
                        { distance: startLength }
                    );
                    // Conversion logic, pop out
                    handleConvert &&
                        handleConvert(style, {
                            text: utils.current.getContentBetween(
                                start,
                                utils.current.getEnd()
                            ),
                        });
                }
                e.preventDefault();
                return true;
            }
        }
        return false;
    };
    const insertLink = (url: string) => {
        wrapLink(editor, url, previous_selection_from_on_blur_ref.current);
    };

    const isSelectionError = (error: Error) => {
        return (
            error.message.indexOf(
                'Cannot resolve a DOM point from Slate point:'
            ) !== -1
        );
    };

    const errorHandler = (error: Error, info: { componentStack: string }) => {
        if (!isSelectionError(error)) {
            console.error(`rendering error`, error, info);
        }
    };

    const ErrorFallback = ({ error, resetErrorBoundary }: any): null => {
        if (isSelectionError(error)) {
            resetErrorBoundary();
        }
        return null;
    };

    const onClick: MouseEventHandler<HTMLDivElement> = e => {
        handleClick && handleClick(e);
    };

    const onDrop = (event: DragEvent) => {
        return true;
    };

    const onDragStart = (event: DragEvent) => {
        return false;
    };

    const onCopy = () => {
        if (handleCopy) {
            return Boolean(handleCopy());
        }
        return false;
    };

    const onBlur = () => {
        if (!alwaysShowPlaceholder) {
            setShowPlaceholder(false);
        }

        if (
            editor.selection &&
            editor.selection !== previous_selection_from_on_blur_ref.current
        ) {
            // / ❓ make previous_selection not null, will it affect other features?
            previous_selection_from_on_blur_ref.current = editor.selection;
            utils.current?.setPreviousSelection(editor.selection);
        }

        Transforms.deselect(editor);

        handleBlur?.(editor.selection);
        focused.current = false;
    };

    const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
        handleMouseDown?.(e);
    };

    return (
        <>
            <ErrorBoundary
                onReset={resetSelectionIfNeeded}
                FallbackComponent={ErrorFallback}
                onError={errorHandler}
            >
                <Slate editor={editor} value={currentValue} onChange={onChange}>
                    <Editable
                        readOnly={readonly}
                        renderElement={renderElement}
                        renderLeaf={renderLeaf}
                        className={`${className} text-manage`}
                        style={style}
                        placeholder={
                            alwaysShowPlaceholder
                                ? placeholder
                                : showPlaceholder
                                ? placeholder
                                : ''
                        }
                        onKeyDown={onKeyDown}
                        onSelect={onSelect}
                        onClick={onClick}
                        onMouseDown={onMouseDown}
                        onDOMBeforeInput={onBeforeInput}
                        spellCheck={false}
                        scrollSelectionIntoView={() => {}}
                        onDragStart={onDragStart}
                        onDrop={onDrop}
                        onCopy={onCopy}
                        onBlur={onBlur}
                    />
                </Slate>
            </ErrorBoundary>

            {supportLink && linkModalVisible && (
                <LinkModal
                    visible={linkModalVisible}
                    onVisibleChange={onLinkModalVisibleChange}
                    insertLink={insertLink}
                    url={linkUrl}
                />
            )}
        </>
    );
});

const EditorElement = (props: any) => {
    const {
        attributes,
        children,
        element,
        editor,
        onLinkModalVisibleChange,
        hideInlineMenu,
        paragraphDataSets = [],
        id,
    } = props;
    const defaultElementStyles = {
        textAlign: element['textAlign'],
    } as React.CSSProperties;

    switch (element.type) {
        case 'link': {
            return (
                <LinkComponent
                    {...props}
                    editor={editor}
                    onLinkModalVisibleChange={onLinkModalVisibleChange}
                    hideInlineMenu={hideInlineMenu}
                />
            );
        }
        case 'date': {
            return <InlineDate {...props} />;
        }
        case 'reflink': {
            return <InlineRefLink block={null} pageId={element.reference} />;
        }
        default: {
            for (let i = 0; i < paragraphDataSets.length; i++) {
                attributes[paragraphDataSets] = 'true';
            }
            return (
                <div
                    style={defaultElementStyles}
                    key={id}
                    className="text-paragraph"
                    {...attributes}
                >
                    {children}
                </div>
            );
        }
    }
};

const EditorLeaf = ({ attributes, children, leaf }: any) => {
    const textStyles = useMemo(() => {
        const styles = {} as { color?: string; backgroundColor?: string };
        if (leaf.fontColor) {
            styles.color = leaf.fontColor as string;
        }
        if (leaf.fontBgColor) {
            styles.backgroundColor = leaf.fontBgColor as string;
        }
        return styles as React.CSSProperties;
    }, [leaf.fontBgColor, leaf.fontColor]);

    const commentsIds = useMemo(
        () => [...getCommentsIdsOnTextNode(leaf)],
        [leaf]
    );

    if (leaf.placeholder) {
        return <span {...attributes}>{children}</span>;
    }
    let customChildren = <String {...children.props} />;

    if (leaf.inlinecode) {
        customChildren = (
            <span {...attributes}>
                <code
                    style={{
                        backgroundColor: 'rgba(135,131,120,0.15)',
                        borderRadius: '3px',
                        color: '#EB5757',
                        fontSize: '0.875em',
                        padding: '0.25em 0.375em',
                    }}
                >
                    {customChildren}
                </code>
            </span>
        );
    }
    if (leaf.bold) {
        customChildren = <strong>{customChildren}</strong>;
    }

    if (leaf.italic) {
        customChildren = <em>{customChildren}</em>;
    }

    if (leaf.underline) {
        attributes.style = {
            ...attributes.style,
            borderBottom: '1px solid rgba(204, 204, 204, 0.9)',
        };
    }

    if (leaf.strikethrough) {
        if (attributes.style) {
            attributes.style = {
                ...attributes.style,
                textDecoration: 'line-through',
            };
        } else {
            attributes.style = {
                textDecoration: 'line-through',
            };
        }
    }

    customChildren = (
        <TextWithComments commentsIds={commentsIds}>
            {customChildren}
        </TextWithComments>
    );

    return (
        <span style={textStyles} {...attributes}>
            {customChildren}
        </span>
    );
};

const String = (props: {
    isLast: boolean;
    leaf: Text;
    parent: Element;
    text: Text;
}) => {
    const { isLast, leaf, parent, text } = props;
    const editor = useSlateStatic();
    const path = ReactEditor.findPath(
        editor as ReactEditor,
        text as unknown as Node
    );
    const parentPath = Path.parent(path);

    if (editor.isVoid(parent as any)) {
        return <ZeroWidthString length={Node.string(parent as any).length} />;
    }

    if (
        (leaf as any).text === '' &&
        // @ts-ignore
        parent.children[parent.children.length - 1] === text &&
        !editor.isInline(parent as any) &&
        Editor.string(editor, parentPath) === ''
    ) {
        return <ZeroWidthString isLineBreak />;
    }

    if ((leaf as any).text === '') {
        return <ZeroWidthString />;
    }

    if (isLast && (leaf as any).text.slice(-1) === '\n') {
        return <TextString isTrailing text={(leaf as any).text} />;
    }

    return <TextString text={(leaf as any).text} />;
};

const TextString = (props: { text: string; isTrailing?: boolean }) => {
    const { text, isTrailing = false } = props;

    const textWithTrailing = useMemo(() => {
        return `${text ?? ''}${isTrailing ? '\n' : ''}`;
    }, [text, isTrailing]);

    return <span data-slate-string>{textWithTrailing}</span>;
};

const ZeroWidthString = (props: { length?: number; isLineBreak?: boolean }) => {
    const { length = 0, isLineBreak = false } = props;
    return (
        <span
            data-slate-zero-width={isLineBreak ? 'n' : 'z'}
            data-slate-length={length}
        >
            {'\uFEFF'}
            {isLineBreak ? <br /> : null}
        </span>
    );
};

const preventBindIfNeeded = (cb: any) => {
    return async (e: any, ...args: any[]) => {
        const shouldPreventDefault =
            cb && (args.length ? await cb(args[0]) : await cb());
        if (shouldPreventDefault) {
            e.preventDefault();
            e.stopPropagation();
        }
    };
};

const createSlateText = (
    text: CustomElement[],
    textStyle: Record<string, unknown>
): Descendant[] => {
    const slateText = [
        {
            type: 'paragraph',
            children: [...text],
            ...textStyle,
        },
    ];
    return slateText;
};
