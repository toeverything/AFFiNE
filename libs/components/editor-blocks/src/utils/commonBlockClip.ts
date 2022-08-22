import {
    AsyncBlock,
    BlockEditor,
    SelectBlock,
} from '@toeverything/components/editor-core';

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
