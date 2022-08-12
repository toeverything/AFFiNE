import {
    DefaultColumnsValue,
    Protocol,
} from '@toeverything/datasource/db-service';
import {
    AsyncBlock,
    BaseView,
    CreateView,
    getTextHtml,
    getTextProperties,
    SelectBlock,
} from '@toeverything/framework/virgo';

import { TextView } from './TextView';

export class QuoteBlock extends BaseView {
    type = Protocol.Block.Type.quote;

    View: (prop: CreateView) => JSX.Element = TextView;

    // override ChildrenView = IndentWrapper;

    override async onCreate(block: AsyncBlock): Promise<AsyncBlock> {
        if (!block.getProperty('text')) {
            await block.setProperty('text', {
                value: [{ text: '' }],
            });
        }
        return block;
    }

    override getSelProperties(
        block: AsyncBlock,
        selectInfo: any
    ): DefaultColumnsValue {
        const properties = super.getSelProperties(block, selectInfo);
        return getTextProperties(properties, selectInfo);
    }

    override html2block(
        el: Element,
        parseEl: (el: Element) => any[]
    ): any[] | null {
        const tag_name = el.tagName;
        if (tag_name === 'BLOCKQUOTE') {
            const childNodes = el.childNodes;
            const texts = [];
            for (let i = 0; i < childNodes.length; i++) {
                const blocks_info = parseEl(childNodes[i] as Element);
                for (let j = 0; j < blocks_info.length; j++) {
                    if (blocks_info[j].type === 'text') {
                        const block_texts =
                            blocks_info[j].properties.text.value;
                        texts.push(...block_texts);
                    }
                }
            }
            return [
                {
                    type: this.type,
                    properties: {
                        text: { value: texts },
                    },
                    children: [],
                },
            ];
        }

        return null;
    }

    override async block2html(
        block: AsyncBlock,
        children: SelectBlock[],
        generateHtml: (el: any[]) => Promise<string>
    ): Promise<string> {
        let content = getTextHtml(block);
        content += await generateHtml(children);
        return `<blockquote>${content}</blockquote>`;
    }
}

export class CalloutBlock extends BaseView {
    type = Protocol.Block.Type.callout;

    View: (prop: CreateView) => JSX.Element = TextView;

    // override ChildrenView = IndentWrapper;

    override async onCreate(block: AsyncBlock): Promise<AsyncBlock> {
        if (!block.getProperty('text')) {
            await block.setProperty('text', {
                value: [{ text: '' }],
            });
        }
        return block;
    }

    override getSelProperties(
        block: AsyncBlock,
        selectInfo: any
    ): DefaultColumnsValue {
        const properties = super.getSelProperties(block, selectInfo);
        return getTextProperties(properties, selectInfo);
    }

    override html2block(
        el: Element,
        parseEl: (el: Element) => any[]
    ): any[] | null {
        const tag_name = el.tagName;
        if (
            tag_name === 'ASIDE' ||
            el.firstChild?.nodeValue?.startsWith('<aside>')
        ) {
            const childNodes = el.childNodes;
            let texts = [];
            for (let i = 0; i < childNodes.length; i++) {
                const blocks_info = parseEl(childNodes[i] as Element);
                for (let j = 0; j < blocks_info.length; j++) {
                    if (blocks_info[j].type === 'text') {
                        const block_texts =
                            blocks_info[j].properties.text.value;
                        texts.push(...block_texts);
                    }
                }
            }
            if (
                texts.length > 0 &&
                (texts[0].text || '').startsWith('<aside>')
            ) {
                texts[0].text = texts[0].text.substring('<aside>'.length);
                if (!texts[0].text) {
                    texts = texts.slice(1);
                }
            }
            return [
                {
                    type: this.type,
                    properties: {
                        text: { value: texts },
                    },
                    children: [],
                },
            ];
        }

        if (el.firstChild?.nodeValue?.startsWith('</aside>')) {
            return [];
        }

        return null;
    }

    override async block2html(
        block: AsyncBlock,
        children: SelectBlock[],
        generateHtml: (el: any[]) => Promise<string>
    ): Promise<string> {
        let content = getTextHtml(block);
        content += await generateHtml(children);
        return `<aside>${content}</aside>`;
    }
}
