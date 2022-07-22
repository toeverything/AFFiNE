// Adapted (mostly copied) the work of https://github.com/fregante
// Copyright (c) Federico Brigante <opensource@bfred.it> (bfred.it)

type ReplacerCallback = (substring: string, ...args: unknown[]) => string;

const INDENT = '  ';

export class TextAreaUtils {
    static insert_text_firefox(
        field: HTMLTextAreaElement | HTMLInputElement,
        text: string
    ): void {
        // Found on https://www.everythingfrontend.com/posts/insert-text-into-textarea-at-cursor-position.html 🎈
        field.setRangeText(
            text,
            field.selectionStart || 0,
            field.selectionEnd || 0,
            'end' // Without this, the cursor is either at the beginning or `text` remains selected
        );

        field.dispatchEvent(
            new InputEvent('input', {
                data: text,
                inputType: 'insertText',
                isComposing: false, // TODO: fix @types/jsdom, this shouldn't be required
            })
        );
    }

    /** Inserts `text` at the cursor’s position, replacing any selection, with **undo** support and by firing the `input` event. */
    static insert(
        field: HTMLTextAreaElement | HTMLInputElement,
        text: string
    ): void {
        const document = field.ownerDocument;
        const initialFocus = document.activeElement;
        if (initialFocus !== field) {
            field.focus();
        }

        if (!document.execCommand('insertText', false, text)) {
            TextAreaUtils.insert_text_firefox(field, text);
        }

        if (initialFocus === document.body) {
            field.blur();
        } else if (
            initialFocus instanceof HTMLElement &&
            initialFocus !== field
        ) {
            initialFocus.focus();
        }
    }

    /** Replaces the entire content, equivalent to `field.value = text` but with **undo** support and by firing the `input` event. */
    static set(
        field: HTMLTextAreaElement | HTMLInputElement,
        text: string
    ): void {
        field.select();
        TextAreaUtils.insert(field, text);
    }

    /** Get the selected text in a field or an empty string if nothing is selected. */
    static get_selection(
        field: HTMLTextAreaElement | HTMLInputElement
    ): string {
        const { selectionStart, selectionEnd } = field;
        return field.value.slice(
            selectionStart ? selectionStart : undefined,
            selectionEnd ? selectionEnd : undefined
        );
    }

    /** Adds the `wrappingText` before and after field’s selection (or cursor). If `endWrappingText` is provided, it will be used instead of `wrappingText` at on the right. */
    static wrap_selection(
        field: HTMLTextAreaElement | HTMLInputElement,
        wrap: string,
        wrapEnd?: string
    ): void {
        const { selectionStart, selectionEnd } = field;
        const selection = TextAreaUtils.get_selection(field);
        TextAreaUtils.insert(field, wrap + selection + (wrapEnd ?? wrap));

        // Restore the selection around the previously-selected text
        field.selectionStart = (selectionStart || 0) + wrap.length;
        field.selectionEnd = (selectionEnd || 0) + wrap.length;
    }

    /** Finds and replaces strings and regex in the field’s value, like `field.value = field.value.replace()` but better */
    static replace(
        field: HTMLTextAreaElement | HTMLInputElement,
        searchValue: string | RegExp,
        replacer: string | ReplacerCallback
    ): void {
        /** Remembers how much each match offset should be adjusted */
        let drift = 0;

        field.value.replace(searchValue, (...args): string => {
            // Select current match to replace it later
            const matchStart = drift + (args[args.length - 2] as number);
            const matchLength = args[0].length;
            field.selectionStart = matchStart;
            field.selectionEnd = matchStart + matchLength;

            const replacement =
                typeof replacer === 'string' ? replacer : replacer(...args);
            TextAreaUtils.insert(field, replacement);

            // Select replacement. Without this, the cursor would be after the replacement
            field.selectionStart = matchStart;
            drift += replacement.length - matchLength;
            return replacement;
        });
    }

    static find_line_end(value: string, currentEnd: number): number {
        // Go to the beginning of the last line
        const lastLineStart = value.lastIndexOf('\n', currentEnd - 1) + 1;

        // There's nothing to unindent after the last cursor, so leave it as is
        if (value.charAt(lastLineStart) !== '\t') {
            return currentEnd;
        }

        return lastLineStart + 1; // Include the first character, which will be a tab
    }

    static indent(element: HTMLTextAreaElement): void {
        const { selectionStart, selectionEnd, value } = element;
        const selectedContrast = value.slice(selectionStart, selectionEnd);
        // The first line should be indented, even if it starts with `\n`
        // The last line should only be indented if includes any character after `\n`
        const lineBreakCount = /\n/g.exec(selectedContrast)?.length;

        if (lineBreakCount && lineBreakCount > 0) {
            // Select full first line to replace everything at once
            const firstLineStart =
                value.lastIndexOf('\n', selectionStart - 1) + 1;

            const newSelection = element.value.slice(
                firstLineStart,
                selectionEnd - 1
            );
            const indentedText = newSelection.replace(
                /^|\n/g, // Match all line starts
                `$&${INDENT}`
            );
            const replacementsCount = indentedText.length - newSelection.length;

            // Replace newSelection with indentedText
            element.setSelectionRange(firstLineStart, selectionEnd - 1);
            TextAreaUtils.insert(element, indentedText);

            // Restore selection position, including the indentation
            element.setSelectionRange(
                selectionStart + 1,
                selectionEnd + replacementsCount
            );
        } else {
            TextAreaUtils.insert(element, INDENT);
        }
    }

    // The first line should always be unindented
    // The last line should only be unindented if the selection includes any characters after `\n`
    static unindent(element: HTMLTextAreaElement): void {
        const { selectionStart, selectionEnd, value } = element;

        // Select the whole first line because it might contain \t
        const firstLineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const minimumSelectionEnd = TextAreaUtils.find_line_end(
            value,
            selectionEnd
        );

        const newSelection = element.value.slice(
            firstLineStart,
            minimumSelectionEnd
        );
        const indentedText = newSelection.replace(/(^|\n)(\t| {1,2})/g, '$1');
        const replacementsCount = newSelection.length - indentedText.length;

        // Replace newSelection with indentedText
        element.setSelectionRange(firstLineStart, minimumSelectionEnd);
        TextAreaUtils.insert(element, indentedText);

        // Restore selection position, including the indentation
        const firstLineIndentation = /\t| {1,2}/.exec(
            value.slice(firstLineStart, selectionStart)
        );

        const difference = firstLineIndentation
            ? firstLineIndentation[0].length
            : 0;

        const newSelectionStart = selectionStart - difference;
        element.setSelectionRange(
            selectionStart - difference,
            Math.max(newSelectionStart, selectionEnd - replacementsCount)
        );
    }
}
