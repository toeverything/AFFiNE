import { Protocol, BlockFlavorKeys } from '@toeverything/datasource/db-service';
import { escape } from '@toeverything/utils';
import { Editor } from '../editor';
import { SelectBlock } from '../selection';
import { ClipBlockInfo } from './types';

class DefaultBlockParse {
    public static html2block(el: Element): ClipBlockInfo[] | undefined | null {
        const tag_name = el.tagName;
        if (tag_name === 'DIV' || el instanceof Text) {
            return el.textContent?.split('\n').map(str => {
                const data = {
                    text: escape(str),
                };
                return {
                    type: 'text',
                    properties: {
                        text: { value: [data] },
                    },
                    children: [],
                };
            });
        }

        return null;
    }
}

export default class ClipboardParse {
    private editor: Editor;
    private static block_types: BlockFlavorKeys[] = [
        Protocol.Block.Type.page,
        Protocol.Block.Type.reference,
        Protocol.Block.Type.heading1,
        Protocol.Block.Type.heading2,
        Protocol.Block.Type.heading3,
        Protocol.Block.Type.quote,
        Protocol.Block.Type.todo,
        Protocol.Block.Type.code,
        Protocol.Block.Type.text,
        Protocol.Block.Type.toc,
        Protocol.Block.Type.file,
        Protocol.Block.Type.image,
        Protocol.Block.Type.divider,
        Protocol.Block.Type.callout,
        Protocol.Block.Type.youtube,
        Protocol.Block.Type.figma,
        Protocol.Block.Type.group,
        Protocol.Block.Type.embedLink,
        Protocol.Block.Type.numbered,
        Protocol.Block.Type.bullet,
    ];
    private static break_flags: Set<string> = new Set([
        'BLOCKQUOTE',
        'BODY',
        'CENTER',
        'DD',
        'DIR',
        'DIV',
        'DL',
        'DT',
        'FORM',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
        'HEAD',
        'HTML',
        'ISINDEX',
        'MENU',
        'NOFRAMES',
        'P',
        'PRE',
        'TABLE',
        'TD',
        'TH',
        'TITLE',
        'TR',
    ]);

    constructor(editor: Editor) {
        this.editor = editor;
        this.generate_html = this.generate_html.bind(this);
        this.parse_dom = this.parse_dom.bind(this);
    }
    // TODO: escape
    public text2blocks(clipData: string): ClipBlockInfo[] {
        return (clipData || '').split('\n').map((str: string) => {
            const block_info: ClipBlockInfo = {
                type: 'text',
                properties: {
                    text: { value: [{ text: str }] },
                },
                children: [] as ClipBlockInfo[],
            };
            return block_info;
        });
    }

    public html2blocks(clipData: string): ClipBlockInfo[] {
        return this.common_html2blocks(clipData);
    }

    private common_html2blocks(clipData: string): ClipBlockInfo[] {
        const html_el = document.createElement('html');
        html_el.innerHTML = clipData;
        return this.parse_dom(html_el);
    }

    // tTODO:odo escape
    private parse_dom(el: Element): ClipBlockInfo[] {
        for (let i = 0; i < ClipboardParse.block_types.length; i++) {
            const block_utils = this.editor.getView(
                ClipboardParse.block_types[i]
            );
            const blocks = block_utils?.html2block?.(el, this.parse_dom);

            if (blocks) {
                return blocks;
            }
        }
        const blocks: ClipBlockInfo[] = [];
        // blocks = DefaultBlockParse.html2block(el);
        for (let i = 0; i < el.childNodes.length; i++) {
            const child = el.childNodes[i];
            const last_block_info =
                blocks.length === 0 ? null : blocks[blocks.length - 1];
            let blocks_info = this.parse_dom(child as Element);
            if (
                last_block_info &&
                last_block_info.type === 'text' &&
                !ClipboardParse.break_flags.has((child as Element).tagName)
            ) {
                const texts = last_block_info.properties?.text?.value || [];
                let j = 0;
                for (; j < blocks_info.length; j++) {
                    const block = blocks_info[j];
                    if (block.type === 'text') {
                        const block_texts = block.properties.text.value;
                        texts.push(...block_texts);
                    }
                }
                last_block_info.properties = {
                    text: { value: texts },
                };
                blocks_info = blocks_info.slice(j);
            }
            blocks.push(...blocks_info);
        }
        return blocks;
    }

    public async generateHtml(): Promise<string> {
        const select_info = await this.editor.selectionManager.getSelectInfo();
        return await this.generate_html(select_info.blocks);
    }

    public async page2html(): Promise<string> {
        const root_block_id = this.editor.getRootBlockId();
        if (!root_block_id) {
            return '';
        }

        const block_info = await this.get_select_info(root_block_id);
        return await this.generate_html([block_info]);
    }

    private async get_select_info(blockId: string) {
        const block = await this.editor.getBlockById(blockId);
        if (!block) return null;
        const block_info: SelectBlock = {
            blockId: block.id,
            children: [],
        };
        const children_ids = block.childrenIds;
        for (let i = 0; i < children_ids.length; i++) {
            block_info.children.push(
                await this.get_select_info(children_ids[i])
            );
        }
        return block_info;
    }

    private async generate_html(selectBlocks: SelectBlock[]): Promise<string> {
        let result = '';
        for (let i = 0; i < selectBlocks.length; i++) {
            const sel_block = selectBlocks[i];
            if (!sel_block || !sel_block.blockId) continue;
            const block = await this.editor.getBlockById(sel_block.blockId);
            if (!block) continue;
            const block_utils = this.editor.getView(block.type);
            const html = await block_utils.block2html(
                block,
                sel_block.children,
                this.generate_html
            );
            result += html;
        }
        return result;
    }

    public dispose() {
        this.editor = null;
    }
}
