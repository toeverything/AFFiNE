import { HooksRunner } from '../types';
import {
    OFFICE_CLIPBOARD_MIMETYPE,
    InnerClipInfo,
    ClipBlockInfo,
} from './types';
import { Editor } from '../editor';
import { AsyncBlock } from '../block';
import ClipboardParse from './clipboard-parse';
import { SelectInfo } from '../selection';
import {
    Protocol,
    BlockFlavorKeys,
    services,
} from '@toeverything/datasource/db-service';
import { MarkdownParser } from './markdown-parse';

// todo needs to be a switch
const support_markdown_paste = true;

enum ClipboardAction {
    COPY = 'copy',
    CUT = 'cut',
    PASTE = 'paste',
}
class BrowserClipboard {
    private event_target: Element;
    private hooks: HooksRunner;
    private editor: Editor;
    private clipboard_parse: ClipboardParse;
    private markdown_parse: MarkdownParser;

    private static optimal_mime_type: string[] = [
        OFFICE_CLIPBOARD_MIMETYPE.DOCS_DOCUMENT_SLICE_CLIP_WRAPPED,
        OFFICE_CLIPBOARD_MIMETYPE.HTML,
        OFFICE_CLIPBOARD_MIMETYPE.TEXT,
    ];

    constructor(eventTarget: Element, hooks: HooksRunner, editor: Editor) {
        this.event_target = eventTarget;
        this.hooks = hooks;
        this.editor = editor;
        this.clipboard_parse = new ClipboardParse(editor);
        this.markdown_parse = new MarkdownParser();
        this.initialize();
    }

    public getClipboardParse() {
        return this.clipboard_parse;
    }

    private initialize() {
        this.handle_copy = this.handle_copy.bind(this);
        this.handle_cut = this.handle_cut.bind(this);
        this.handle_paste = this.handle_paste.bind(this);

        document.addEventListener(ClipboardAction.COPY, this.handle_copy);
        document.addEventListener(ClipboardAction.CUT, this.handle_cut);
        document.addEventListener(ClipboardAction.PASTE, this.handle_paste);
        this.event_target.addEventListener(
            ClipboardAction.COPY,
            this.handle_copy
        );
        this.event_target.addEventListener(
            ClipboardAction.CUT,
            this.handle_cut
        );
        this.event_target.addEventListener(
            ClipboardAction.PASTE,
            this.handle_paste
        );
    }

    private handle_copy(e: Event) {
        //@ts-ignore
        if (e.defaultPrevented || e.target.nodeName === 'INPUT') {
            return;
        }

        this.dispatch_clipboard_event(
            ClipboardAction.COPY,
            e as ClipboardEvent
        );
    }

    private handle_cut(e: Event) {
        //@ts-ignore
        if (e.defaultPrevented || e.target.nodeName === 'INPUT') {
            return;
        }
        this.dispatch_clipboard_event(ClipboardAction.CUT, e as ClipboardEvent);
    }

    private handle_paste(e: Event) {
        //@ts-ignore TODO should be handled more scientifically here, whether to trigger the paste time, also need some whitelist mechanism
        if (e.defaultPrevented || e.target.nodeName === 'INPUT') {
            return;
        }

        const clipboardData = (e as ClipboardEvent).clipboardData;

        const isPureFile = this.is_pure_file_in_clipboard(clipboardData);

        if (!isPureFile) {
            this.paste_content(clipboardData);
        } else {
            this.paste_file(clipboardData);
        }
        // this.editor.selectionManager
        //     .getSelectInfo()
        //     .then(selectionInfo => console.log(selectionInfo));

        e.stopPropagation();
    }

    private paste_content(clipboardData: any) {
        const originClip: { data: any; type: any } = this.getOptimalClip(
            clipboardData
        ) as { data: any; type: any };
        const originTextClipData = clipboardData.getData(
            OFFICE_CLIPBOARD_MIMETYPE.TEXT
        );

        let clipData = originClip['data'];

        if (originClip['type'] === OFFICE_CLIPBOARD_MIMETYPE.TEXT) {
            clipData = this.excape_html(clipData);
        }

        switch (originClip['type']) {
            /** Protocol paste */
            case OFFICE_CLIPBOARD_MIMETYPE.DOCS_DOCUMENT_SLICE_CLIP_WRAPPED:
                this.fire_paste_edit_action(clipData);
                break;
            case OFFICE_CLIPBOARD_MIMETYPE.HTML:
                this.paste_html(clipData, originTextClipData);
                break;
            case OFFICE_CLIPBOARD_MIMETYPE.TEXT:
                this.paste_text(clipData, originTextClipData);
                break;

            default:
                break;
        }
    }

    private paste_html(clipData: any, originTextClipData: any) {
        if (support_markdown_paste) {
            const has_markdown =
                this.markdown_parse.checkIfTextContainsMd(originTextClipData);
            if (has_markdown) {
                try {
                    const convertedDataObj =
                        this.markdown_parse.md2Html(originTextClipData);
                    if (convertedDataObj.isConverted) {
                        clipData = convertedDataObj.text;
                    }
                } catch (e) {
                    console.error(e);
                    clipData = originTextClipData;
                }
            }
        }

        const blocks = this.clipboard_parse.html2blocks(clipData);
        this.insert_blocks(blocks);
    }

    private paste_text(clipData: any, originTextClipData: any) {
        const blocks = this.clipboard_parse.text2blocks(clipData);
        this.insert_blocks(blocks);
    }

    private async paste_file(clipboardData: any) {
        const file = this.get_image_file(clipboardData);
        if (file) {
            const result = await services.api.file.create({
                workspace: this.editor.workspace,
                file: file,
            });
            const block_info: ClipBlockInfo = {
                type: 'image',
                properties: {
                    image: {
                        value: result.id,
                        name: file.name,
                        size: file.size,
                        type: file.type,
                    },
                },
                children: [] as ClipBlockInfo[],
            };
            this.insert_blocks([block_info]);
        }
    }

    private get_image_file(clipboardData: any) {
        const files = clipboardData.files;
        if (files && files[0] && files[0].type.indexOf('image') > -1) {
            return files[0];
        }
        return;
    }

    private excape_html(data: any, onlySpace?: any) {
        if (!onlySpace) {
            // TODO:
            // data = string.htmlEscape(data);
            // data = data.replace(/\n/g, '<br>');
        }

        // data = data.replace(/ /g, '&nbsp;');
        // data = data.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
        return data;
    }

    public getOptimalClip(clipboardData: any) {
        const mimeTypeArr = BrowserClipboard.optimal_mime_type;

        for (let i = 0; i < mimeTypeArr.length; i++) {
            const data =
                clipboardData[mimeTypeArr[i]] ||
                clipboardData.getData(mimeTypeArr[i]);

            if (data) {
                return {
                    type: mimeTypeArr[i],
                    data: data,
                };
            }
        }

        return '';
    }

    private is_pure_file_in_clipboard(clipboardData: DataTransfer) {
        const types = clipboardData.types;

        const res =
            (types.length === 1 && types[0] === 'Files') ||
            (types.length === 2 &&
                (types.includes('text/plain') || types.includes('text/html')) &&
                types.includes('Files'));

        return res;
    }

    private async fire_paste_edit_action(clipboardData: any) {
        const clip_info: InnerClipInfo = JSON.parse(clipboardData);
        clip_info && this.insert_blocks(clip_info.data, clip_info.select);
    }

    private can_edit_text(type: BlockFlavorKeys) {
        return (
            type === Protocol.Block.Type.page ||
            type === Protocol.Block.Type.text ||
            type === Protocol.Block.Type.heading1 ||
            type === Protocol.Block.Type.heading2 ||
            type === Protocol.Block.Type.heading3 ||
            type === Protocol.Block.Type.quote ||
            type === Protocol.Block.Type.todo ||
            type === Protocol.Block.Type.code ||
            type === Protocol.Block.Type.callout ||
            type === Protocol.Block.Type.numbered ||
            type === Protocol.Block.Type.bullet
        );
    }

    // TODO: cursor positioning problem
    private async insert_blocks(blocks: ClipBlockInfo[], select?: SelectInfo) {
        if (blocks.length === 0) {
            return;
        }

        const cur_select_info =
            await this.editor.selectionManager.getSelectInfo();
        if (cur_select_info.blocks.length === 0) {
            return;
        }

        let begin_index = 0;
        const cur_node_id =
            cur_select_info.blocks[cur_select_info.blocks.length - 1].blockId;
        let cur_block = await this.editor.getBlockById(cur_node_id);
        const block_view = this.editor.getView(cur_block.type);
        if (
            cur_select_info.type === 'Range' &&
            cur_block.type === 'text' &&
            block_view.isEmpty(cur_block)
        ) {
            cur_block.setType(blocks[0].type);
            cur_block.setProperties(blocks[0].properties);
            this.paste_children(cur_block, blocks[0].children);
            begin_index = 1;
        } else if (
            select?.type === 'Range' &&
            cur_select_info.type === 'Range' &&
            this.can_edit_text(cur_block.type) &&
            this.can_edit_text(blocks[0].type)
        ) {
            if (
                cur_select_info.blocks.length > 0 &&
                cur_select_info.blocks[0].startInfo
            ) {
                const start_info = cur_select_info.blocks[0].startInfo;
                const end_info = cur_select_info.blocks[0].endInfo;
                const cur_text_value = cur_block.getProperty('text').value;
                const pre_cur_text_value = cur_text_value.slice(
                    0,
                    start_info.arrayIndex
                );
                const last_cur_text_value = cur_text_value.slice(
                    end_info.arrayIndex + 1
                );
                const pre_text = cur_text_value[
                    start_info.arrayIndex
                ].text.substring(0, start_info.offset);
                const last_text = cur_text_value[
                    end_info.arrayIndex
                ].text.substring(end_info.offset);

                let last_block: ClipBlockInfo = blocks[blocks.length - 1];
                if (!this.can_edit_text(last_block.type)) {
                    last_block = { type: 'text', children: [] };
                    blocks.push(last_block);
                }
                const last_values = last_block.properties?.text?.value;
                last_text && last_values.push({ text: last_text });
                last_values.push(...last_cur_text_value);
                last_block.properties = {
                    text: { value: last_values },
                };

                const insert_info = blocks[0].properties.text;
                pre_text && pre_cur_text_value.push({ text: pre_text });
                pre_cur_text_value.push(...insert_info.value);
                this.editor.blockHelper.setBlockBlur(cur_node_id);
                setTimeout(async () => {
                    const cur_block = await this.editor.getBlockById(
                        cur_node_id
                    );
                    cur_block.setProperties({
                        text: { value: pre_cur_text_value },
                    });
                    this.paste_children(cur_block, blocks[0].children);
                }, 0);
                begin_index = 1;
            }
        }

        for (let i = begin_index; i < blocks.length; i++) {
            const next_block = await this.editor.createBlock(blocks[i].type);
            next_block.setProperties(blocks[i].properties);
            if (cur_block.type === 'page') {
                cur_block.prepend(next_block);
            } else {
                cur_block.after(next_block);
            }

            this.paste_children(next_block, blocks[i].children);
            cur_block = next_block;
        }
    }

    private async paste_children(parent: AsyncBlock, children: any[]) {
        for (let i = 0; i < children.length; i++) {
            const next_block = await this.editor.createBlock(children[i].type);
            next_block.setProperties(children[i].properties);
            parent.append(next_block);
            await this.paste_children(next_block, children[i].children);
        }
    }

    private pre_copy_cut(action: ClipboardAction, e: ClipboardEvent) {
        switch (action) {
            case ClipboardAction.COPY:
                this.hooks.beforeCopy(e);
                break;

            case ClipboardAction.CUT:
                this.hooks.beforeCut(e);
                break;
        }
    }

    private dispatch_clipboard_event(
        action: ClipboardAction,
        e: ClipboardEvent
    ) {
        this.pre_copy_cut(action, e);
    }

    dispose() {
        document.removeEventListener(ClipboardAction.COPY, this.handle_copy);
        document.removeEventListener(ClipboardAction.CUT, this.handle_cut);
        document.removeEventListener(ClipboardAction.PASTE, this.handle_paste);
        this.event_target.removeEventListener(
            ClipboardAction.COPY,
            this.handle_copy
        );
        this.event_target.removeEventListener(
            ClipboardAction.CUT,
            this.handle_cut
        );
        this.event_target.removeEventListener(
            ClipboardAction.PASTE,
            this.handle_paste
        );
        this.clipboard_parse.dispose();
        this.clipboard_parse = null;
        this.event_target = null;
        this.hooks = null;
        this.editor = null;
    }
}

export { BrowserClipboard };
