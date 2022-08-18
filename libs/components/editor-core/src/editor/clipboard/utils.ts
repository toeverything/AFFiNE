import { Editor } from '../editor';
import { ClipBlockInfo, OFFICE_CLIPBOARD_MIMETYPE } from './types';
import { Clip } from './clip';

export const shouldHandlerContinue = (event: Event, editor: Editor) => {
    const filterNodes = ['INPUT', 'SELECT', 'TEXTAREA'];

    if (event.defaultPrevented) {
        return false;
    }
    if (filterNodes.includes((event.target as HTMLElement)?.tagName)) {
        return false;
    }

    return editor.selectionManager.currentSelectInfo.type !== 'None';
};

export const getClipInfoOfBlockById = async (
    editor: Editor,
    blockId: string
) => {
    const block = await editor.getBlockById(blockId);
    const blockView = editor.getView(block.type);
    const blockInfo: ClipBlockInfo = {
        type: block.type,
        properties: blockView.getSelProperties(block, {}),
        children: [] as ClipBlockInfo[],
    };
    const children = await block?.children();

    for (let i = 0; i < children.length; i++) {
        const childInfo = await getClipInfoOfBlockById(editor, children[i].id);
        blockInfo.children.push(childInfo);
    }
    return blockInfo;
};

export const getClipDataOfBlocksById = async (
    editor: Editor,
    blockIds: string[]
) => {
    const clipInfos = await Promise.all(
        blockIds.map(blockId => getClipInfoOfBlockById(editor, blockId))
    );

    return new Clip(
        OFFICE_CLIPBOARD_MIMETYPE.DOCS_DOCUMENT_SLICE_CLIP_WRAPPED,
        JSON.stringify({
            data: clipInfos,
        })
    );
};
