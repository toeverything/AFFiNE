/* eslint-disable max-lines */
import {
    Descendant,
    Editor,
    Location,
    Node as SlateNode,
    Path,
    Point,
    Range,
    Text,
    Transforms,
} from 'slate';
import { ReactEditor } from 'slate-react';

import {
    fontBgColorPalette,
    fontColorPalette,
    type TextAlignOptions,
    type TextStyleMark,
} from './constants';
import {
    getCommentsIdsOnTextNode,
    getEditorMarkForCommentId,
    MARKDOWN_STYLE_MAP,
    MatchRes,
} from './utils';

function isInlineAndVoid(editor: Editor, el: any) {
    return editor.isInline(el) && editor.isVoid(el);
}

function isElementEnd(editor: Editor, el: any, offset: number) {
    return el.text && el.text.length === offset;
}

export function isSelectAll(editor: Editor) {
    const {
        selection: { anchor, focus },
        children,
    } = editor;
    const nodes = (children[0] as any).children as any[];
    if (anchor.offset === 0 && anchor?.path[1] === 0) {
        if (
            focus?.path[1] === nodes.length - 1 &&
            focus.offset === nodes[nodes.length - 1]?.text?.length
        ) {
            return true;
        }
    }
    return false;
}

function isObject(o: any) {
    return Object.prototype.toString.call(o) === '[object Object]';
}

function isPlainObject(o: any) {
    let ctor, prot;

    if (isObject(o) === false) return false;

    // If has modified constructor
    ctor = o.constructor;
    if (ctor === undefined) return true;

    // If has modified prototype
    prot = ctor.prototype;
    if (isObject(prot) === false) return false;

    // If constructor does not have an Object-specific method
    // eslint-disable-next-line no-prototype-builtins
    if (prot.hasOwnProperty('isPrototypeOf') === false) {
        return false;
    }

    // Most likely a plain Object
    return true;
}

const isDeepEqual = (
    node: Record<string, any>,
    another: Record<string, any>
): boolean => {
    for (const key in node) {
        const a = node[key];
        const b = another[key];
        if (isPlainObject(a) && isPlainObject(b)) {
            if (!isDeepEqual(a, b)) return false;
        } else if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) return false;
            }
        } else if (a !== b) {
            return false;
        }
    }

    for (const key in another) {
        if (node[key] === undefined && another[key] !== undefined) {
            return false;
        }
    }

    return true;
};

Transforms.move = function (
    editor: Editor,
    options: {
        distance?: number;
        unit?: 'offset' | 'character' | 'word' | 'line';
        reverse?: boolean;
        edge?: 'anchor' | 'focus' | 'start' | 'end';
    } = {}
): void {
    const { selection } = editor;
    const { distance = 1, unit = 'offset', reverse = false } = options;
    let { edge = null } = options;

    if (!selection) {
        return;
    }

    if (edge === 'start') {
        edge = Range.isBackward(selection) ? 'focus' : 'anchor';
    }

    if (edge === 'end') {
        edge = Range.isBackward(selection) ? 'anchor' : 'focus';
    }

    const { anchor, focus } = selection;
    const opts = { distance, unit };
    const props: Partial<Range> = {};

    if (edge == null || edge === 'anchor') {
        const point = reverse
            ? Editor.before(editor, anchor, opts)
            : Editor.after(editor, anchor, opts);

        if (point) {
            props.anchor = point;
        }
    }

    if (edge == null || edge === 'focus') {
        const point = reverse
            ? Editor.before(editor, focus, opts)
            : Editor.after(editor, focus, opts);

        if (point) {
            props.focus = point;
        }
    }

    Transforms.setSelection(editor, props);
};

Text.equals = function (
    text: Text,
    another: Text,
    options: { loose?: boolean } = {}
): boolean {
    const { loose = false } = options;

    function omitText(obj: Record<any, any>) {
        const { text, ...rest } = obj;

        return rest;
    }

    return isDeepEqual(
        loose ? omitText(text) : text,
        loose ? omitText(another) : another
    );
};

Editor.addMark = function (editor: Editor, key: string, value: any): void {
    Transforms.setNodes(
        editor,
        { [key]: value },
        {
            match: isInlineAndVoid.bind(undefined, editor),
            split: true,
        }
    );
    editor.addMark(key, value);
};

Editor.removeMark = function (editor: Editor, key: string): void {
    // Need to handle all selected inline entities by yourself
    // Transforms.unsetNodes(editor, key, {
    // match: isInlineAndVoid.bind(undefined, editor)
    // });
    Transforms.setNodes(
        editor,
        { [key]: null },
        { match: Text.isText, split: true }
    );
    editor.removeMark(key);
};

/** override */
Editor.insertText = function (
    editor: Editor,
    text: string,
    options: {
        at?: Location;
        voids?: boolean;
    } = {}
): void {
    Editor.withoutNormalizing(editor, () => {
        const { voids = false } = options;
        let { at = editor.selection } = options;

        if (!at) {
            return;
        }

        if (Path.isPath(at)) {
            at = Editor.range(editor, at);
        }

        if (Range.isRange(at)) {
            if (Range.isCollapsed(at)) {
                at = at.anchor;
            } else {
                const end = Range.end(at);

                if (!voids && Editor.void(editor, { at: end })) {
                    return;
                }

                const pointRef = Editor.pointRef(editor, end);
                Transforms.delete(editor, { at, voids });
                at = pointRef.unref()!;
                Transforms.setSelection(editor, { anchor: at, focus: at });
            }
        }

        if (!voids && Editor.void(editor, { at })) {
            return;
        }

        const { path, offset } = at;
        if (text.length > 0) {
            const marks = Editor.marks(editor);
            if (text === '\u0020' && Object.keys(marks).length) {
                // If the input is a space and the mark has content, remove the mark
                const newPath = [path[0], path[1] + 1];
                const newPoint = {
                    path: newPath,
                    offset: 1,
                } as Point;
                const newRange = {
                    anchor: newPoint,
                    focus: newPoint,
                } as Range;
                editor.apply({
                    type: 'insert_node',
                    path: newPath,
                    node: { text },
                });
                editor.apply({
                    type: 'set_selection',
                    properties: null,
                    newProperties: newRange,
                });
                return;
            }

            editor.apply({ type: 'insert_text', path, offset, text });
        }
    });
};

/** override */
Transforms.select = function (editor: Editor, target: Location): void {
    const { selection } = editor;
    target = Editor.range(editor, target);

    if (Range.isCollapsed(target) && target.focus.path.length > 2) {
        // It is folded, and it may be drilled to a deep level, forcibly pulled out
        const path = target.focus.path;
        const [el] = Editor.node(editor, target);
        const [parentEl] = Editor.node(editor, [path[0], path[1]]);
        // @ts-ignore
        if (
            parentEl &&
            el &&
            (isInlineAndVoid(editor, parentEl) ||
                isElementEnd(editor, el, target.focus.offset))
        ) {
            // Inline entity, the last content of the deep level, go directly out
            let newPoint = Editor.after(editor, target);
            if (!newPoint) {
                Transforms.insertNodes(
                    editor,
                    {
                        text: '',
                    },
                    { at: [path[0], path[1] + 1] }
                );
                newPoint = Editor.after(editor, target);
            }
            target.focus = newPoint;
            target.anchor = newPoint;
        }
    }
    if (selection) {
        Transforms.setSelection(editor, target);
        return;
    }

    if (!Range.isRange(target)) {
        throw new Error(`wrong selection params: ${JSON.stringify(target)}`);
    }

    editor.apply({
        type: 'set_selection',
        properties: selection,
        newProperties: target,
    });
};
/** override */
Transforms.setSelection = function (editor: Editor, props: any) {
    const selection: any = editor.selection;
    const oldProps: Record<string, any> = {};
    const newProps: Record<string, any> = {};

    if (!selection) {
        return;
    }

    for (const k in props) {
        if (
            (k === 'anchor' &&
                props.anchor != null &&
                !Point.equals(props.anchor, selection.anchor)) ||
            (k === 'focus' &&
                props.focus != null &&
                !Point.equals(props.focus, selection.focus)) ||
            (k !== 'anchor' && k !== 'focus' && props[k] !== selection[k])
        ) {
            oldProps[k] = selection[k];
            newProps[k] = props[k];
        }
    }

    if (Object.keys(oldProps).length > 0) {
        editor.apply({
            type: 'set_selection',
            properties: oldProps,
            newProperties: newProps,
        });
    }
};

/** override */
Editor.before = function (
    editor: Editor,
    at: Location,
    options: {
        distance?: number;
        unit?: 'offset' | 'character' | 'word' | 'line' | 'block';
        voids?: boolean;
    } = {}
): Point | undefined {
    const anchor = Editor.start(editor, []);
    const focus = Editor.point(editor, at, { edge: 'start' });
    const range = { anchor, focus };
    const { distance = 1, unit = 'offset' } = options;
    let d = 0;
    let target;

    const positions = Editor.positions(editor, {
        ...options,
        at: range,
        reverse: true,
        unit,
    });
    for (const p of positions) {
        if (d > distance) {
            break;
        }
        if (d !== 0) {
            target = p;
        }
        d++;
    }

    if (target) {
        const { path, offset } = target;
        // @ts-expect-error
        const element = editor?.children?.[path[0]]?.children?.[path[1]];
        const oldElement =
            // @ts-expect-error
            editor?.children?.[focus.path[0]]?.children?.[focus.path[1]];
        if (element) {
            if (isInlineAndVoid(editor, element)) {
                // Inline entities need to be drilled out
                // target = Editor.before(editor, target);
                target = {
                    path: [0, path[1] - 1],
                    offset: 0,
                };
            } else if (editor.isInline(element) && !editor.isVoid(element)) {
                // Inline styles such as hyperlinks need to drill directly into it
                const inlineTextLength = element?.children?.[0]?.text?.length;
                if (inlineTextLength === offset || offset === 0) {
                    // This case should not exist, continue before
                    target = Editor.before(editor, target);
                }
            } else if (
                oldElement &&
                oldElement.text &&
                element.text &&
                !('children' in element) &&
                !Path.equals(path, focus.path) &&
                !('children' in oldElement) &&
                Editor.isEnd(editor, target, target.path)
            ) {
                // Simple rich text excessively needs to be in the previous one
                target = Editor.before(editor, target);
            }
        }
    }

    return target;
};

/** override */
Editor.after = function (
    editor: Editor,
    at: Location,
    options: {
        distance?: number;
        unit?: 'offset' | 'character' | 'word' | 'line' | 'block';
        voids?: boolean;
    } = {}
): Point | undefined {
    const anchor = Editor.point(editor, at, { edge: 'end' });
    const focus = Editor.end(editor, []);
    const range = { anchor, focus };
    const { distance = 1, unit = 'offset' } = options;
    let d = 0;
    let target;

    for (const p of Editor.positions(editor, {
        ...options,
        at: range,
        unit,
    })) {
        if (d > distance) {
            break;
        }

        if (d !== 0) {
            target = p;
        }

        d++;
    }

    if (target) {
        const { path, offset } = target;
        // @ts-expect-error
        const element = editor?.children?.[path[0]]?.children?.[path[1]];
        const oldElement =
            // @ts-expect-error
            editor?.children?.[anchor.path[0]]?.children?.[anchor.path[1]];
        if (element) {
            if (isInlineAndVoid(editor, element)) {
                // Inline entities need to be drilled out
                target = Editor.after(editor, target);
            } else if (editor.isInline(element) && !editor.isVoid(element)) {
                // Inline styles such as hyperlinks need to drill directly into it
                const inlineTextLength = element?.children?.[0]?.text?.length;
                if (inlineTextLength === offset || offset === 0) {
                    // This case should not exist, continue after
                    target = Editor.after(editor, target);
                }
            } else if (
                oldElement &&
                oldElement.text &&
                element.text &&
                !Path.equals(path, anchor.path) &&
                !('children' in element) &&
                !('children' in oldElement) &&
                Editor.isStart(editor, target, target.path)
            ) {
                // Simple rich text is excessively required in the next one
                target = Editor.after(editor, target);
            }
        }
    }
    return target;
};

type SelectionStartAndEnd = {
    selectionStart: Point;
    selectionEnd: Point;
};

export type Contents = {
    contentBeforeSelection: {
        content: Descendant[];
        isEmpty: boolean;
    };
    contentAfterSelection: {
        content: Descendant[];
        isEmpty: boolean;
    };
};

class SlateUtils {
    public editor: ReactEditor;

    /** save slate-selection before slate-editor lose focus  */
    private previous_selection: Range | null;

    constructor(editor: ReactEditor) {
        this.editor = editor;
        this.previous_selection = null;
    }

    public getSelectionStartAndEnd(
        currentSelection?: Range
    ): SelectionStartAndEnd | undefined {
        const selection =
            currentSelection || (this.editor && this.editor.selection);
        if (!selection) {
            return undefined;
        }
        const selectionCompareRes = Point.compare(
            selection.focus,
            selection.anchor
        );
        let selectionStart: Point, selectionEnd: Point;
        switch (selectionCompareRes) {
            case 1:
                // focus is before anchor
                selectionStart = selection.anchor;
                selectionEnd = selection.focus;
                break;
            case 0:
                // focus is the same as anchor
                selectionStart = selectionEnd = selection.focus;
                break;
            case -1:
                // focus after anchor
                selectionStart = selection.focus;
                selectionEnd = selection.anchor;
                break;
            default:
                throw new Error('some thing is wrong');
        }
        return {
            selectionStart,
            selectionEnd,
        };
    }

    public getContentBetween(point1: Point, point2: Point) {
        const fragment = Editor.fragment(this.editor, {
            anchor: point1,
            focus: point2,
        });
        if (!fragment.length) {
            console.error('Debug information:', point1, point2, fragment);
            throw new Error('Failed to get content between!');
        }

        if (fragment.length > 1) {
            console.warn(
                'Fragment length is greater than one, ' +
                    'please be careful if there is missing content!\n' +
                    'Debug information:',
                point1,
                point2,
                fragment
            );
        }

        const firstFragment = fragment[0];
        if (!('type' in firstFragment)) {
            console.error('Debug information:', point1, point2, fragment);
            throw new Error(
                'Failed to get content between! type of firstFragment not found!'
            );
        }

        const fragmentChildren = firstFragment.children;

        const textChildren: Text[] = [];
        for (const child of fragmentChildren) {
            if (!('text' in child)) {
                console.error('Debug information:', point1, point2, fragment);
                throw new Error('Fragment exists nested!');
            }
            // Filter empty string
            if (child.text === '') {
                continue;
            }
            textChildren.push(child);
        }
        // If nothing, should preserve empty string
        // Fix Slate Cannot get the start point in the node at path [0] because it has no start text node.
        if (!textChildren.length) {
            textChildren.push({ text: '' });
        }

        return textChildren;
    }

    public getSplitContentsBySelection() {
        if (!this.editor) return undefined;
        const { selectionStart, selectionEnd } = this.getSelectionStartAndEnd();
        const start = this.getStart();
        const end = this.getEnd();
        return {
            contentBeforeSelection: {
                content: this.getContentBetween(start, selectionStart),
                isEmpty: Point.equals(start, selectionStart),
            },
            contentAfterSelection: {
                content: this.getContentBetween(selectionEnd, end),
                isEmpty: Point.equals(end, selectionEnd),
            },
        } as Contents;
    }

    public isCollapsed() {
        if (!this.editor) return false;
        const selection = this.editor.selection;
        if (!selection) return false;
        return Range.isCollapsed(selection);
    }

    public isStart() {
        if (this.isCollapsed()) {
            return Point.equals(this.getStart(), this.editor.selection.focus);
        }
        return false;
    }

    public isSelectAll() {
        if (!this.isCollapsed()) {
            return isSelectAll(this.editor);
        }
        return false;
    }

    public isEnd() {
        if (this.isCollapsed()) {
            return Point.equals(this.getEnd(), this.editor.selection.focus);
        }
        return false;
    }

    public setPreviousSelection(selection: Range) {
        this.previous_selection = selection;
    }

    public setPreviousSelectionToSlate() {
        if (this.previous_selection) {
            this.setSelection(this.previous_selection);
        }
    }

    public getStart() {
        return Editor.start(this.editor, {
            path: [0, 0],
            offset: 0,
        });
    }

    public getEnd() {
        return Editor.end(this.editor, [0]);
    }

    public getEndSelection() {
        return {
            anchor: this.getEnd(),
            focus: this.getEnd(),
        } as Range;
    }

    public getStringBetween(point1: Point, point2: Point) {
        const str = Editor.string(this.editor, {
            anchor: point1,
            focus: point2,
        });
        return str;
    }

    public getString() {
        return this.getStringBetween(this.getStart(), this.getEnd());
    }

    public getStringBetweenStartAndSelection() {
        if (!this.editor) {
            return undefined;
        }
        const { selectionEnd } = this.getSelectionStartAndEnd();
        return this.getStringBetween(this.getStart(), selectionEnd);
    }

    public getStringBetweenSelection(shouldUsePreviousSelection = false) {
        if (!this.editor) {
            return undefined;
        }
        if (shouldUsePreviousSelection) {
            this.setPreviousSelectionToSlate();
        }
        const { selectionStart, selectionEnd } = this.getSelectionStartAndEnd();
        return this.getStringBetween(selectionStart, selectionEnd);
    }

    public getPathOfString(matRes: MatchRes) {
        // @ts-ignore
        const children = this.editor.children[0].children;
        const { start, style } = matRes;
        let startPoint: Point;
        let endPoint: Point;
        for (let i = 0; i < children.length; i++) {
            if (Text.isText(children[i])) {
                if (!startPoint) {
                    const startOffset = children[i].text.indexOf(start);
                    if (startOffset > -1) {
                        startPoint = {
                            offset: startOffset,
                            path: [0, i],
                        };
                        continue;
                    }
                }
            }
        }
        const { selectionEnd } = this.getSelectionStartAndEnd();
        endPoint = { ...selectionEnd };
        if (startPoint && endPoint) {
            return {
                startPoint,
                endPoint,
                style,
            };
        }
        return null;
    }

    public turnStyleBetweenPoints(
        startPoint: Point,
        endPoint: Point,
        style: string,
        startLength: number
    ) {
        const at = {
            anchor: startPoint,
            focus: endPoint,
        };
        Transforms.select(this.editor, at);
        const fragmentNode = this.editor.getFragment();
        this.editor.deleteFragment();
        let deleteLength = 0;
        // @ts-ignore
        const fragments = fragmentNode[0].children;
        for (let i = 0; i < fragments.length; i++) {
            const fragment = { ...fragments[i] };
            // @ts-ignore
            fragment[MARKDOWN_STYLE_MAP[style]] = true; // Give the style parsed by markdown
            // Delete the last markdown syntax, there is a bug: if there are multiple markdown syntaxes at the end, and they are not in the same fragment, there will be problems
            if (i === fragments.length - 1) {
                // Assume that the markdown syntax is all in a fragment, and then change it later if there is a problem
                for (let j = 0; j < startLength; j++) {
                    fragment.text = fragment.text.slice(
                        0,
                        fragment.text.length - 1
                    );
                }
            }
            if (deleteLength !== startLength) {
                // markdown syntax is not removed cleanly
                if (fragment.text.length >= startLength - deleteLength) {
                    // The length of the current fragment is greater than the length of the markdown syntax to be deleted, delete it directly
                    fragment.text = fragment.text.slice(
                        startLength - deleteLength
                    );
                    deleteLength = startLength;
                    if (fragment.text) {
                        this.editor.insertFragment([fragment]);
                    }
                } else {
                    // The content of the current fragment is not enough to delete, how many can be deleted
                    deleteLength += fragment.text.length;
                }
                continue;
            }
            this.editor.insertFragment([fragment]);
        }
    }

    public setSelection(selection: Range, index?: number) {
        if (!this.isSelectionSafe(selection)) {
            return;
        }
        this.focus();
        Transforms.select(this.editor, selection);
    }

    /** Get a safe selection, if it exceeds the limit, the bottom line is the first or last */
    public isSelectionSafe(selection: Range) {
        if (!Range.isRange(selection)) {
            return false;
        }
        const { selectionEnd } = this.getSelectionStartAndEnd(selection);
        const endPoint = this.getEnd();
        const compare = Point.compare(selectionEnd, endPoint);
        if (compare === 1) {
            // beyond the end, give the end
            return false;
        }
        return true;
    }

    /** Whether the selection is at the beginning */
    public isSelectStart() {
        return this.isSelectionEqualsInDom(this.getStartSelection());
    }
    /** Whether the selection is at the end */
    public isSelectEnd() {
        return this.isSelectionEqualsInDom(this.getEndSelection());
    }

    /** Is the selection consistent */
    public isSelectionEqualsInDom(selection: Range) {
        const sel = window.getSelection();
        const currentSelection = ReactEditor.toSlateRange(this.editor, sel, {
            exactMatch: false,
            suppressThrow: false,
        });
        return Range.equals(selection, currentSelection);
    }

    public focus() {
        ReactEditor.focus(this.editor);
    }

    public blur() {
        ReactEditor.blur(this.editor);
    }

    /** get text styles in selection, like bold/italic */
    public getStyleBySelection() {
        const res = [];
        const marks = Editor.marks(this.editor);
        for (const key in marks) {
            res.push(key);
        }
        return res;
    }

    public setStyleBySelection(format: string) {
        Editor.addMark(this.editor, format, true);
    }

    public removeStyleBySelection(format: string) {
        Editor.removeMark(this.editor, format);
    }

    public setTextFontColorBySelection(
        color: keyof typeof fontColorPalette,
        shouldUsePreviousSelection = false
    ) {
        if (shouldUsePreviousSelection) {
            this.setPreviousSelectionToSlate();
        }
        Editor.addMark(this.editor, 'fontColor', fontColorPalette[color]);
    }

    public setTextFontBgColorBySelection(
        bgColor: keyof typeof fontBgColorPalette,
        shouldUsePreviousSelection = false
    ) {
        if (shouldUsePreviousSelection) {
            this.setPreviousSelectionToSlate();
        }
        Editor.addMark(this.editor, 'fontBgColor', fontBgColorPalette[bgColor]);
    }

    public setCommentBySelection(
        commentId: string,
        status: 'default' | 'resolved' | 'active' = 'default',
        shouldUsePreviousSelection = false
    ) {
        if (shouldUsePreviousSelection) {
            this.setPreviousSelectionToSlate();
        }
        Editor.addMark(
            this.editor,
            getEditorMarkForCommentId(commentId),
            status
        );
    }

    public resolveCommentById(commentId: string) {
        const commentMarkId = getEditorMarkForCommentId(commentId);
        Transforms.setNodes(
            this.editor,
            { [commentMarkId]: 'resolved' } as Partial<SlateNode>,
            {
                at: [],
                // @ts-ignore type mismatch only in production
                match: n => Text.isText(n) && n[commentMarkId] !== 'resolved',
            }
        );
    }

    public toggleTextFormatBySelection(format: TextStyleMark) {
        const isActive = this.isTextFormatActive(format);

        if (isActive) {
            Editor.removeMark(this.editor, format);
        } else {
            Editor.addMark(this.editor, format, true);
        }
    }

    public isTextFormatActive(format: TextStyleMark) {
        const marks = Editor.marks(this.editor) as any;
        return marks ? marks[format] === true : false;
    }

    public setParagraphAlignBySelection(
        style: TextAlignOptions,
        shouldUsePreviousSelection = false
    ) {
        if (shouldUsePreviousSelection) {
            this.setPreviousSelectionToSlate();
        }
        Transforms.setNodes(
            this.editor,
            { textAlign: style } as Partial<SlateNode>,
            {
                match: n => Editor.isBlock(this.editor, n),
            }
        );
    }

    public insertNodes(
        nodes: SlateNode | Array<SlateNode>,
        options?: Parameters<typeof Transforms.insertNodes>[2]
    ) {
        Transforms.insertNodes(this.editor, nodes, {
            ...options,
        });
    }

    public getNodeByPath(path: Path) {
        Editor.node(this.editor, path);
    }

    public getStartSelection() {
        return {
            anchor: this.getStart(),
            focus: this.getStart(),
        } as Range;
    }

    public getCurrentSelection() {
        if (!this.editor) return undefined;
        return this.editor.selection;
    }

    public isEmpty() {
        // @ts-ignore
        const children = this.editor.children[0].children;
        // @ts-ignore
        return (
            children.length === 1 &&
            typeof children[0].text !== undefined &&
            children[0].text === ''
        );
    }

    public selectionToSlateRange(selection: Selection) {
        try {
            const currentSelection = ReactEditor.toSlateRange(
                this.editor,
                selection,
                {
                    exactMatch: false,
                    suppressThrow: false,
                }
            );
            return currentSelection;
        } catch (error) {
            return undefined;
        }
    }

    public setSearchSlash(point: Point) {
        const str = Editor.string(this.editor, {
            anchor: this.getStart(),
            focus: point,
        });
        if (str.endsWith('/')) {
            // select the slash node
            Transforms.select(this.editor, {
                anchor: point,
                focus: Object.assign({}, point, {
                    offset: point.offset - 1,
                }),
            });
            Editor.addMark(this.editor, 'search', true);
            // set cursor back
            Transforms.select(this.editor, {
                anchor: this.editor.selection.anchor,
                focus: this.editor.selection.anchor,
            });
        }
    }

    public getSearchSlashText() {
        const nodes = Editor.nodes(this.editor, {
            at: [],
            //@ts-ignore
            match: node => !!node.search,
        });
        const searchNode = nodes.next().value;
        if (searchNode && (searchNode[0] as { text?: string }).text) {
            return (searchNode[0] as { text?: string }).text;
        }
        return '';
    }

    public removeSearchSlash(isRemoveSlash?: boolean) {
        if (isRemoveSlash) {
            const nodes = Editor.nodes(this.editor, {
                at: [],
                //@ts-ignore
                match: node => !!node.search,
            });
            const searchNode = nodes.next().value;
            if (searchNode) {
                const text = (searchNode[0] as { text?: string })?.text || '';
                if (text.startsWith('/')) {
                    const path = searchNode[1];
                    Transforms.delete(this.editor, {
                        at: {
                            path,
                            offset: 0,
                        },
                        distance: 1,
                        unit: 'character',
                    });
                }
            }
        }
        Transforms.setNodes(
            this.editor,
            { search: null } as Partial<SlateNode>,
            {
                at: [],
                match: node => {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    //@ts-ignore
                    return !!node.search;
                },
                // split: true
            }
        );
        this.editor.removeMark('search');
    }

    public removeSelection(selection: Selection) {
        const range = this.selectionToSlateRange(selection);

        this.editor.apply({
            type: 'remove_node',
            path: range.focus.path,
            node: this.editor,
        });
    }

    public insertReference(reference: string) {
        try {
            // Transforms.setSelection(this.editor, this.getEndSelection());
            const { anchor, focus } = this.getEndSelection();
            Transforms.insertNodes(
                this.editor,
                {
                    type: 'reflink',
                    reference,
                    children: [],
                },
                { at: focus || anchor }
            );

            // requestAnimationFrame(() => {
            //     console.log(this.editor.selection, this.editor.insertNode);
            //     this.editor.insertNode({
            //         type: 'reflink',
            //         reference,
            //         children: [{ text: '' }]
            //     });
            //     // Transforms.select();
            // });
        } catch (e) {
            console.log(e);
        }
    }

    /** todo  improve if selection is collapsed  */
    public getCommentsIdsBySelection() {
        const commentedTextNodes = Editor.nodes(this.editor, {
            mode: 'lowest',
            match: n => Text.isText(n) && getCommentsIdsOnTextNode(n).size > 0,
        });
        const commentsIds = new Set<string>();
        let currentTextNode = commentedTextNodes.next().value;
        while (currentTextNode) {
            for (const id of getCommentsIdsOnTextNode(
                currentTextNode[0] as any
            )) {
                commentsIds.add(id);
            }
            currentTextNode = commentedTextNodes.next().value;
        }

        return [...commentsIds];
    }

    public transformPoint(...args: Parameters<typeof Point.transform>) {
        return Point.transform(...args);
    }

    public dispose() {
        delete this.previous_selection;
        delete this.editor;
    }
}

export { SlateUtils };
