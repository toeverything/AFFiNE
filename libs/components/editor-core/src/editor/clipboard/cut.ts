import { Editor } from '../editor';
import { SelectInfo } from '../selection';
import { Clip } from './clip';
import { ClipboardUtils } from './clipboardUtils';
import { OFFICE_CLIPBOARD_MIMETYPE } from './types';
class Cut {
    private _editor: Editor;
    private _utils: ClipboardUtils;
    constructor(editor: Editor) {
        this._editor = editor;
        this._utils = new ClipboardUtils(editor);
        this.handleCut = this.handleCut.bind(this);
    }

    public async handleCut(e: ClipboardEvent) {
        e.preventDefault();
        e.stopPropagation();
        const selectInfo: SelectInfo =
            await this._editor.selectionManager.getSelectInfo();

        const clips = await this.getClips(selectInfo);
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

        this._editor.blockHelper.removeSelection(selectInfo);
    }

    async getClips(selectInfo: SelectInfo) {
        const clips: Clip[] = [];

        // get custom clip
        const affineClip = await this._getAffineClip(selectInfo);
        clips.push(affineClip);

        const textClip = await this._getTextClip(selectInfo);
        clips.push(textClip);

        const htmlClip = await this._getHtmlClip(selectInfo);

        clips.push(htmlClip);

        return clips;
    }

    private async _getHtmlClip(selectInfo: SelectInfo): Promise<Clip> {
        const htmlStr = (
            await Promise.all(
                selectInfo.blocks.map(async selectBlockInfo => {
                    const block = await this._editor.getBlockById(
                        selectBlockInfo.blockId
                    );
                    const blockView = this._editor.getView(block.type);
                    return await blockView.block2html({
                        editor: this._editor,
                        block,
                        selectInfo: selectBlockInfo,
                    });
                })
            )
        ).join('');

        return new Clip(OFFICE_CLIPBOARD_MIMETYPE.HTML, htmlStr);
    }

    private async _getAffineClip(selectInfo: SelectInfo): Promise<Clip> {
        if (selectInfo.type === 'Range') {
            return this._utils.getClipDataOfBlocksBySelectInfo(selectInfo);
        }

        // The only remaining case is that selectInfo.type === 'Block'
        return this._utils.getClipDataOfBlocksById(
            selectInfo.blocks.map(block => block.blockId)
        );
    }

    private async _getTextClip(selectInfo: SelectInfo): Promise<Clip> {
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

export { Cut };
