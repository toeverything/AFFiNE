import { useEffect, useState } from 'react';
// import { basicSetup, minimalSetup } from 'codemirror';
import { EditorState, StateEffect, Extension } from '@codemirror/state';
import {
    indentWithTab,
    defaultKeymap,
    history,
    historyKeymap,
} from '@codemirror/commands';
import {
    EditorView,
    keymap,
    ViewUpdate,
    placeholder,
    highlightSpecialChars,
    drawSelection,
    highlightActiveLine,
    dropCursor,
    rectangularSelection,
    crosshairCursor,
    lineNumbers,
    highlightActiveLineGutter,
} from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { ReactCodeMirrorProps } from './CodeMirror';

import {
    defaultHighlightStyle,
    syntaxHighlighting,
    indentOnInput,
    bracketMatching,
    foldGutter,
    foldKeymap,
} from '@codemirror/language';
// import {searchKeymap, highlightSelectionMatches} from "@codemirror/search"
// import {autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap} from "@codemirror/autocomplete"
// import {lintKeymap} from "@codemirror/lint"

export interface UseCodeMirror extends ReactCodeMirrorProps {
    container?: HTMLDivElement | null;
}

const basicSetup: Extension = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
];

export function useCodeMirror(props: UseCodeMirror) {
    const {
        value,
        selection,
        onChange,
        onUpdate,
        handleKeyArrowUp,
        handleKeyArrowDown,
        extensions = [],
        autoFocus,
        theme = 'light',
        height = '',
        minHeight = '',
        maxHeight = '',
        placeholder: placeholderStr = '',
        width = '',
        minWidth = '',
        maxWidth = '',
        editable = true,
        readOnly = false,
        indentWithTab: defaultIndentWithTab = true,
        basicSetup: defaultBasicSetup = true,

        root,
    } = props;
    const [container, setContainer] = useState(props.container);
    const [view, setView] = useState<EditorView>();
    const [state, setState] = useState<EditorState>();
    const defaultLightThemeOption = EditorView.theme(
        {
            '&': {
                backgroundColor: '#fff',
            },
        },
        {
            dark: false,
        }
    );
    const defaultThemeOption = EditorView.theme({
        '&': {
            height,
            minHeight,
            maxHeight,
            width,
            minWidth,
            maxWidth,
        },
    });
    const updateListener = EditorView.updateListener.of((vu: ViewUpdate) => {
        if (vu.docChanged && typeof onChange === 'function') {
            const doc = vu.state.doc;
            const value = doc.toString();
            onChange(value, vu);
        }
    });
    // keymap.of([{''}])
    // keymap.of()
    const upFunction = [
        {
            key: 'ArrowUp',
            run: () => {
                handleKeyArrowUp();
                return false;
            },
        },
        {
            key: 'ArrowDown',
            run: (e: any) => {
                handleKeyArrowDown();

                return false;
            },
        },
    ];
    // completionKeymap

    let getExtensions = [updateListener, keymap.of(upFunction)];

    if (defaultIndentWithTab) {
        getExtensions.unshift(keymap.of([indentWithTab]));
    }
    if (defaultBasicSetup) {
        getExtensions.unshift(basicSetup);
    }

    if (placeholderStr) {
        getExtensions.unshift(placeholder(placeholderStr));
    }

    switch (theme) {
        case 'light':
            getExtensions.push(defaultLightThemeOption);
            break;
        case 'dark':
            getExtensions.push(oneDark);
            break;
        default:
            getExtensions.push(theme);
            break;
    }

    if (editable === false) {
        getExtensions.push(EditorView.editable.of(false));
    }
    if (readOnly) {
        getExtensions.push(EditorState.readOnly.of(true));
    }

    if (onUpdate && typeof onUpdate === 'function') {
        getExtensions.push(EditorView.updateListener.of(onUpdate));
    }
    getExtensions.unshift(keymap.of([indentWithTab]));
    getExtensions = getExtensions.concat(extensions);

    useEffect(() => {
        if (container && !state) {
            const stateCurrent = EditorState.create({
                doc: value,
                selection,
                extensions: getExtensions,
            });
            setState(stateCurrent);
            if (!view) {
                const viewCurrent = new EditorView({
                    state: stateCurrent,
                    parent: container,
                    root,
                });
                setView(viewCurrent);
            }
        }
        return () => {
            if (view) {
                setView(undefined);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [container, state]);

    useEffect(
        () => () => {
            if (view) {
                view.destroy();
                setView(undefined);
            }
        },
        [view]
    );

    useEffect(() => {
        if (autoFocus && view) {
            view.focus();
        }
    }, [autoFocus, view]);

    useEffect(() => {
        const currentValue = view ? view.state.doc.toString() : '';
        if (view && value !== currentValue) {
            view.dispatch({
                changes: {
                    from: 0,
                    to: currentValue.length,
                    insert: value || '',
                },
            });
        }
    }, [value, view]);

    useEffect(() => {
        if (view) {
            view.dispatch({
                effects: StateEffect.reconfigure.of(getExtensions),
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        theme,
        extensions,
        height,
        minHeight,
        maxHeight,
        width,
        placeholderStr,
        minWidth,
        maxWidth,
        editable,
        defaultIndentWithTab,
        defaultBasicSetup,
    ]);

    return { state, setState, view, setView, container, setContainer };
}
