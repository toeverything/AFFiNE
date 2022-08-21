import { Editor } from '../editor';
import { SelectInfo } from '../selection';
import { OFFICE_CLIPBOARD_MIMETYPE } from './types';
import { Clip } from './clip';
import ClipboardParse from './clipboard-parse';
import { getClipDataOfBlocksById } from './utils';
import { ClipboardUtils } from './clipboardUtils';
class Copy {
    private _editor: Editor;
    private _clipboardParse: ClipboardParse;
    private _utils: ClipboardUtils;
    constructor(editor: Editor) {
        this._editor = editor;
        this._clipboardParse = new ClipboardParse(editor);
        this._utils = new ClipboardUtils(editor);
        this.handleCopy = this.handleCopy.bind(this);
    }
    public async handleCopy(e: ClipboardEvent) {
        e.preventDefault();
        e.stopPropagation();
        const clips = await this.getClips();
        if (!clips.length) {
            return;
        }
        const success = this._copyToClipboardFromPc(clips);
        if (!success) {
            // This way, not compatible with firefox
            const clipboardData = e.clipboardData;
            if (clipboardData) {
                try {
                    clips.forEach(clip => {
                        clipboardData.setData(
                            clip.getMimeType(),
                            clip.getData()
                        );
                    });
                } catch (e) {
                    // TODO handle exception
                }
            }
        }
    }

    async getClips() {
        const clips: Clip[] = [];

        // get custom clip
        const affineClip = await this._getAffineClip();
        clips.push(affineClip);

        const textClip = await this._getTextClip();
        clips.push(textClip);

        // const htmlClip = await this._getHtmlClip();
        // clips.push(htmlClip);
        const htmlClip = await this._clipboardParse.generateHtml();
        htmlClip &&
            clips.push(new Clip(OFFICE_CLIPBOARD_MIMETYPE.HTML, htmlClip));

        return clips;
    }

    // private async _getHtmlClip(): Promise<Clip> {
    //     const selectInfo: SelectInfo =
    //         await this._editor.selectionManager.getSelectInfo();
    //
    //     if (selectInfo.type === 'Range') {
    //         const html = (
    //             await Promise.all(
    //                 selectInfo.blocks.map(async selectBlockInfo => {
    //                     const block = await this._editor.getBlockById(
    //                         selectBlockInfo.blockId
    //                     );
    //                     const blockView = this._editor.getView(block.type);
    //                     const block2html = await blockView.block2html({
    //                         editor: this._editor,
    //                         block,
    //                         selectInfo: selectBlockInfo,
    //                     });
    //
    //                     if (
    //                         await this._editor.blockHelper.isBlockEditable(
    //                             block
    //                         )
    //                     ) {
    //                         const selectedProperties =
    //                             await this._editor.blockHelper.getEditableBlockPropertiesBySelectInfo(
    //                                 block,
    //                                 selectBlockInfo
    //                             );
    //
    //                         return (
    //                             block2html ||
    //                             this._editor.blockHelper.convertTextValue2Html(
    //                                 block.id,
    //                                 selectedProperties.text.value
    //                             )
    //                         );
    //                     }
    //
    //                     return block2html;
    //                 })
    //             )
    //         ).join('');
    //         console.log('html', html);
    //     }
    //
    //     return new Clip(OFFICE_CLIPBOARD_MIMETYPE.HTML, 'blockText');
    // }

    private async _getAffineClip(): Promise<Clip> {
        const selectInfo: SelectInfo =
            await this._editor.selectionManager.getSelectInfo();

        if (selectInfo.type === 'Range') {
            return this._utils.getClipDataOfBlocksBySelectInfo(selectInfo);
        }

        // The only remaining case is that selectInfo.type === 'Block'
        return this._utils.getClipDataOfBlocksById(
            selectInfo.blocks.map(block => block.blockId)
        );
    }

    private async _getTextClip(): Promise<Clip> {
        const selectInfo: SelectInfo =
            await this._editor.selectionManager.getSelectInfo();

        if (selectInfo.type === 'Range') {
            const text = (
                await Promise.all(
                    selectInfo.blocks.map(async selectBlockInfo => {
                        const block = await this._editor.getBlockById(
                            selectBlockInfo.blockId
                        );
                        const blockView = this._editor.getView(block.type);
                        const block2Text = await blockView.block2Text(
                            block,
                            selectBlockInfo
                        );

                        return (
                            block2Text ||
                            this._editor.blockHelper.getBlockTextBetweenSelection(
                                selectBlockInfo.blockId,
                                false
                            )
                        );
                    })
                )
            ).join('\n');
            return new Clip(OFFICE_CLIPBOARD_MIMETYPE.TEXT, text);
        }

        // The only remaining case is that selectInfo.type === 'Block'
        const selectedBlocks = (
            await Promise.all(
                selectInfo.blocks.map(selectBlockInfo =>
                    this._editor.blockHelper.getFlatBlocksUnderParent(
                        selectBlockInfo.blockId,
                        true
                    )
                )
            )
        ).flat();

        const blockText = (
            await Promise.all(
                selectedBlocks.map(async block => {
                    const blockView = this._editor.getView(block.type);
                    const block2Text = await blockView.block2Text(block);
                    return (
                        block2Text ||
                        this._editor.blockHelper.getBlockText(block.id)
                    );
                })
            )
        ).join('\n');

        return new Clip(OFFICE_CLIPBOARD_MIMETYPE.TEXT, blockText);
    }

    // TODO: Optimization
    // TODO: is not compatible with safari
    private _copyToClipboardFromPc(clips: any[]) {
        let success = false;
        const tempElem = document.createElement('textarea');
        tempElem.value = 'temp';
        document.body.appendChild(tempElem);
        tempElem.select();
        tempElem.setSelectionRange(0, tempElem.value.length);

        const listener = function (e: any) {
            const clipboardData = e.clipboardData;
            if (clipboardData) {
                clips.forEach(clip => {
                    clipboardData.setData(clip.getMimeType(), clip.getData());
                });
            }

            e.preventDefault();
            e.stopPropagation();
            tempElem.removeEventListener('copy', listener);
        } as any;

        tempElem.addEventListener('copy', listener);
        try {
            success = document.execCommand('copy');
        } finally {
            tempElem.removeEventListener('copy', listener);
            document.body.removeChild(tempElem);
        }
        return success;
    }
}

export { Copy };
