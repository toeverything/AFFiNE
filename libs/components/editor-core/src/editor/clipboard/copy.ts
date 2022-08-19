import { Editor } from '../editor';
import { SelectInfo } from '../selection';
import { OFFICE_CLIPBOARD_MIMETYPE } from './types';
import { Clip } from './clip';
import ClipboardParse from './clipboard-parse';
import { getClipDataOfBlocksById } from './utils';
import { copyToClipboard } from '@toeverything/utils';
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
        const clips: Clip[] = [];

        // get custom clip
        const affineClip = await this._getAffineClip();
        clips.push(affineClip);

        // get common html clip
        const htmlClip = await this._clipboardParse.generateHtml();
        htmlClip &&
            clips.push(new Clip(OFFICE_CLIPBOARD_MIMETYPE.HTML, htmlClip));

        return clips;
    }

    private async _getAffineClip(): Promise<Clip> {
        const selectInfo: SelectInfo =
            await this._editor.selectionManager.getSelectInfo();

        return getClipDataOfBlocksById(
            this._editor,
            selectInfo.blocks.map(block => block.blockId)
        );
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
