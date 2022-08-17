import { Editor } from '../editor';
import { SelectInfo, SelectBlock } from '../selection';
import {
    ClipBlockInfo,
    OFFICE_CLIPBOARD_MIMETYPE,
    InnerClipInfo,
} from './types';
import { Clip } from './clip';
import assert from 'assert';
import ClipboardParse from './clipboard-parse';

class Copy {
    private _editor: Editor;
    private _clipboardParse: ClipboardParse;

    constructor(editor: Editor) {
        this._editor = editor;
        this._clipboardParse = new ClipboardParse(editor);

        this.handleCopy = this.handleCopy.bind(this);
    }
    public async handleCopy(e: ClipboardEvent) {
        e.preventDefault();
        e.stopPropagation();
        const clips = await this.getClips();
        if (!clips.length) {
            return;
        }
        // TODO: is not compatible with safari
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
        const clips: any[] = [];

        // get custom clip
        const affineClip = await this._getAffineClip();
        clips.push(
            new Clip(
                OFFICE_CLIPBOARD_MIMETYPE.DOCS_DOCUMENT_SLICE_CLIP_WRAPPED,
                JSON.stringify(affineClip)
            )
        );

        // get common html clip
        const htmlClip = await this._clipboardParse.generateHtml();
        htmlClip &&
            clips.push(new Clip(OFFICE_CLIPBOARD_MIMETYPE.HTML, htmlClip));

        return clips;
    }

    private async _getAffineClip(): Promise<InnerClipInfo> {
        const clips: ClipBlockInfo[] = [];
        const selectInfo: SelectInfo =
            await this._editor.selectionManager.getSelectInfo();
        for (let i = 0; i < selectInfo.blocks.length; i++) {
            const selBlock = selectInfo.blocks[i];
            const clipBlockInfo = await this._getClipInfoOfBlock(selBlock);
            clips.push(clipBlockInfo);
        }
        return {
            select: selectInfo,
            data: clips,
        };
    }

    private async _getClipInfoOfBlock(selBlock: SelectBlock) {
        const block = await this._editor.getBlockById(selBlock.blockId);
        const blockView = this._editor.getView(block.type);
        assert(blockView);
        const blockInfo: ClipBlockInfo = {
            type: block.type,
            properties: blockView.getSelProperties(block, selBlock),
            children: [] as any[],
        };

        for (let i = 0; i < selBlock.children.length; i++) {
            const childInfo = await this._getClipInfoOfBlock(
                selBlock.children[i]
            );
            blockInfo.children.push(childInfo);
        }

        return blockInfo;
    }

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
