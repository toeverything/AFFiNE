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
        const success = this.copy_to_cliboard_from_pc(clips);
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

    private copy_to_cliboard_from_pc(clips: any[]) {
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

    private async get_clip_block_info(selBlock: SelectBlock) {
        const block = await this._editor.getBlockById(selBlock.blockId);
        const block_view = this._editor.getView(block.type);
        assert(block_view);
        const block_info: ClipBlockInfo = {
            type: block.type,
            properties: block_view.getSelProperties(block, selBlock),
            children: [] as any[],
        };

        for (let i = 0; i < selBlock.children.length; i++) {
            const child_info = await this.get_clip_block_info(
                selBlock.children[i]
            );
            block_info.children.push(child_info);
        }

        return block_info;
    }

    private async get_inner_clip(): Promise<InnerClipInfo> {
        const clips: ClipBlockInfo[] = [];
        const select_info: SelectInfo =
            await this._selectionManager.getSelectInfo();
        for (let i = 0; i < select_info.blocks.length; i++) {
            const sel_block = select_info.blocks[i];
            const clip_block_info = await this.get_clip_block_info(sel_block);
            clips.push(clip_block_info);
        }
        const clipInfo: InnerClipInfo = {
            select: select_info,
            data: clips,
        };
        return clipInfo;
    }

    async getClips() {
        const clips: any[] = [];

        const inner_clip = await this.get_inner_clip();
        clips.push(
            new Clip(
                OFFICE_CLIPBOARD_MIMETYPE.DOCS_DOCUMENT_SLICE_CLIP_WRAPPED,
                JSON.stringify(inner_clip)
            )
        );

        const html_clip = await this._clipboardParse.generateHtml();
        html_clip &&
            clips.push(new Clip(OFFICE_CLIPBOARD_MIMETYPE.HTML, html_clip));

        return clips;
    }

    disposeInternal() {
        this._sub.unsubscribe();
        this._hooks = null;
    }
}

export { ClipboardPopulator };
