import { Editor } from '../editor';
import { SelectionManager, SelectInfo, SelectBlock } from '../selection';
import { HookType, PluginHooks } from '../types';
import {
    ClipBlockInfo,
    OFFICE_CLIPBOARD_MIMETYPE,
    InnerClipInfo,
} from './types';
import { Clip } from './clip';
import assert from 'assert';
import ClipboardParse from './clipboard-parse';
import { Subscription } from 'rxjs';

class ClipboardPopulator {
    private _editor: Editor;
    private _hooks: PluginHooks;
    private _selectionManager: SelectionManager;
    private _clipboardParse: ClipboardParse;
    private _sub = new Subscription();

    constructor(
        editor: Editor,
        hooks: PluginHooks,
        selectionManager: SelectionManager
    ) {
        this._editor = editor;
        this._hooks = hooks;
        this._selectionManager = selectionManager;
        this._clipboardParse = new ClipboardParse(editor);
        this._sub.add(
            hooks
                .get(HookType.BEFORE_COPY)
                .subscribe(this._populateAppClipboard)
        );
        this._sub.add(
            hooks.get(HookType.BEFORE_CUT).subscribe(this._populateAppClipboard)
        );
    }

    private _populateAppClipboard = async (e: ClipboardEvent) => {
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
    };

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

    private async _getClipBlockInfo(selBlock: SelectBlock) {
        const block = await this._editor.getBlockById(selBlock.blockId);
        const blockView = this._editor.getView(block.type);
        assert(blockView);
        const blockInfo: ClipBlockInfo = {
            type: block.type,
            properties: blockView.getSelProperties(block, selBlock),
            children: [] as any[],
        };

        for (let i = 0; i < selBlock.children.length; i++) {
            const childInfo = await this._getClipBlockInfo(
                selBlock.children[i]
            );
            blockInfo.children.push(childInfo);
        }

        return blockInfo;
    }

    private async _getInnerClip(): Promise<InnerClipInfo> {
        const clips: ClipBlockInfo[] = [];
        const selectInfo: SelectInfo =
            await this._selectionManager.getSelectInfo();
        for (let i = 0; i < selectInfo.blocks.length; i++) {
            const selBlock = selectInfo.blocks[i];
            const clipBlockInfo = await this._getClipBlockInfo(selBlock);
            clips.push(clipBlockInfo);
        }
        return {
            select: selectInfo,
            data: clips,
        };
    }

    async getClips() {
        const clips: any[] = [];

        const innerClip = await this._getInnerClip();
        clips.push(
            new Clip(
                OFFICE_CLIPBOARD_MIMETYPE.DOCS_DOCUMENT_SLICE_CLIP_WRAPPED,
                JSON.stringify(innerClip)
            )
        );

        const htmlClip = await this._clipboardParse.generateHtml();
        htmlClip &&
            clips.push(new Clip(OFFICE_CLIPBOARD_MIMETYPE.HTML, htmlClip));

        return clips;
    }

    disposeInternal() {
        this._sub.unsubscribe();
        this._hooks = null;
    }
}

export { ClipboardPopulator };
