import {
    AsyncBlock,
    BlockEditor,
    HTML2BlockResult,
    SelectBlock,
} from '@toeverything/components/editor-core';
import { BlockFlavorKeys } from '@toeverything/datasource/db-service';

export type Block2HtmlProps = {
    editor: BlockEditor;
    block: AsyncBlock;
    // The selectInfo parameter is not passed when the block is selected in ful, the selectInfo.type is Range
    selectInfo?: SelectBlock;
};

export const commonBlock2HtmlContent = async ({
    editor,
    block,
    selectInfo,
}: Block2HtmlProps) => {
    const html =
        await editor.clipboard.clipboardUtils.convertTextValue2HtmlBySelectInfo(
            block,
            selectInfo
        );
    const childrenHtml =
        await editor.clipboard.clipboardUtils.convertBlock2HtmlBySelectInfos(
            block,
            selectInfo?.children
        );
    return `${html}${childrenHtml}`;
};

export const commonHTML2block = ({
    element,
    editor,
    tagName,
    type,
    ignoreEmptyElement = true,
}: {
    element: Element;
    editor: BlockEditor;
    tagName: string | string[];
    type: BlockFlavorKeys;
    ignoreEmptyElement?: boolean;
}): HTML2BlockResult => {
    const tagNames = typeof tagName === 'string' ? [tagName] : tagName;
    if (tagNames.includes(element.tagName)) {
        const res = editor.clipboard.clipboardUtils.commonHTML2Block(
            element,
            type,
            ignoreEmptyElement
        );
        return res ? [res] : null;
    }
    return null;
};
