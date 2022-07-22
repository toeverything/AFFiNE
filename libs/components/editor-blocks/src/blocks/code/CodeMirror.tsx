import React, { useEffect, useRef, useImperativeHandle } from 'react';
import { EditorState, EditorStateConfig, Extension } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { useCodeMirror } from './use-code-mirror';

export * from './use-code-mirror';

export interface ReactCodeMirrorProps
    extends Omit<EditorStateConfig, 'doc' | 'extensions'>,
        Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'placeholder'> {
    /** value of the auto created model in the editor. */
    value?: string;
    height?: string;
    minHeight?: string;
    maxHeight?: string;
    width?: string;
    minWidth?: string;
    maxWidth?: string;
    /** focus on the editor. */
    autoFocus?: boolean;
    /** Enables a placeholder—a piece of example content to show when the editor is empty. */
    placeholder?: string | HTMLElement;
    /**
     * `light` / `dark` / `Extension` Defaults to `light`.
     * @default light
     */
    theme?: 'light' | 'dark' | Extension;
    /**
     * Whether to optional basicSetup by default
     * @default true
     */
    basicSetup?: boolean;
    /**
     * This disables editing of the editor content by the user.
     * @default true
     */
    editable?: boolean;
    readOnly?: boolean;
    /**
     * Whether to optional basicSetup by default
     * @default true
     */
    indentWithTab?: boolean;
    /** Fired whenever a change occurs to the document. */
    onChange?(value: string, viewUpdate: ViewUpdate): void;
    /** Fired whenever a change occurs to the document. There is a certain difference with `onChange`. */
    onUpdate?(viewUpdate: ViewUpdate): void;
    handleKeyArrowUp?: () => void;
    handleKeyArrowDown?: () => void;
    /**
     * Extension values can be [provided](https://codemirror.net/6/docs/ref/#state.EditorStateConfig.extensions) when creating a state to attach various kinds of configuration and behavior information.
     * They can either be built-in extension-providing objects,
     * such as [state fields](https://codemirror.net/6/docs/ref/#state.StateField) or [facet providers](https://codemirror.net/6/docs/ref/#state.Facet.of),
     * or objects with an extension in its `extension` property. Extensions can be nested in arrays arbitrarily deep—they will be flattened when processed.
     */
    extensions?: Extension[];
    /**
     * If the view is going to be mounted in a shadow root or document other than the one held by the global variable document (the default), you should pass it here.
     * Originally from the [config of EditorView](https://codemirror.net/6/docs/ref/#view.EditorView.constructor%5Econfig.root)
     */
    root?: ShadowRoot | Document;
}

export interface ReactCodeMirrorRef {
    editor?: HTMLDivElement | null;
    state?: EditorState;
    view?: EditorView;
}

const ReactCodeMirror = React.forwardRef<
    ReactCodeMirrorRef,
    ReactCodeMirrorProps
>((props, ref) => {
    const {
        className,
        value = '',
        selection,
        extensions = [],
        onChange,
        onUpdate,
        handleKeyArrowUp,
        handleKeyArrowDown,
        autoFocus,
        theme = 'light',
        height,
        minHeight,
        maxHeight,
        width,
        minWidth,
        maxWidth,
        basicSetup,
        placeholder,
        indentWithTab,
        editable,
        readOnly,
        root,
        ...other
    } = props;
    const editor = useRef<HTMLDivElement>(null);
    const { state, view, container, setContainer } = useCodeMirror({
        container: editor.current,
        root,
        value,
        autoFocus,
        theme,
        height,
        minHeight,
        maxHeight,
        width,
        minWidth,
        maxWidth,
        basicSetup,
        placeholder,
        indentWithTab,
        editable,
        readOnly,
        selection,
        onChange,
        onUpdate,
        extensions,
        handleKeyArrowUp,
        handleKeyArrowDown,
    });
    useImperativeHandle(ref, () => ({ editor: container, state, view }), [
        container,
        state,
        view,
    ]);
    useEffect(() => {
        setContainer(editor.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // check type of value
    if (typeof value !== 'string') {
        throw new Error(`value must be typeof string but got ${typeof value}`);
    }

    const defaultClassNames =
        typeof theme === 'string' ? `cm-theme-${theme}` : 'cm-theme';
    return (
        <div
            ref={editor}
            className={`${defaultClassNames}${
                className ? ` ${className}` : ''
            }`}
            {...other}
        />
    );
});

ReactCodeMirror.displayName = 'CodeMirror';

export default ReactCodeMirror;
