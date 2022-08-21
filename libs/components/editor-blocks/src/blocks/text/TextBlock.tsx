import {
    BaseView,
    CreateView,
    AsyncBlock,
    SelectBlock,
    getTextHtml,
} from '@toeverything/framework/virgo';
import {
    DefaultColumnsValue,
    Protocol,
} from '@toeverything/datasource/db-service';
import { TextView } from './TextView';

import { getRandomString } from '@toeverything/components/common';

export class TextBlock extends BaseView {
    type = Protocol.Block.Type.text;

    View: (prop: CreateView) => JSX.Element = TextView;

    override async onCreate(block: AsyncBlock): Promise<AsyncBlock> {
        if (!block.getProperty('text')) {
            await block.setProperty('text', {
                value: [{ text: '' }],
            });
        }
        return block;
    }

    override html2block(
        el: Element,
        parseEl: (el: Element) => any[]
    ): any[] | null {
        if (el instanceof Text) {
            // TODO: parsing style
            return el.textContent.split('\n').map(text => {
                return {
                    type: this.type,
                    properties: {
                        text: { value: [{ text: text }] },
                    },
                    children: [],
                };
            });
        }

        const tag_name = el.tagName;
        const block_style: any = {};
        switch (tag_name) {
            case 'STRONG':
            case 'B':
                block_style.bold = true;
                break;
            case 'A':
                block_style.type = 'link';
                block_style.url = el.getAttribute('href');
                block_style.id = getRandomString('link');
                block_style.children = [];
                break;
            case 'EM':
                block_style.italic = true;
                break;
            case 'U':
                block_style.underline = true;
                break;
            case 'CODE':
                block_style.inlinecode = true;
                break;
            case 'S':
            case 'DEL':
                block_style.strikethrough = true;
                break;
            default:
                break;
        }

        const child_nodes = el.childNodes;
        let texts = [];
        if (Object.keys(block_style).length > 0) {
            for (let i = 0; i < child_nodes.length; i++) {
                const blocks_info: any[] = parseEl(child_nodes[i] as Element);
                for (let j = 0; j < blocks_info.length; j++) {
                    const block = blocks_info[j];
                    if (block.type === this.type) {
                        const block_texts = block.properties.text.value.map(
                            (text_value: any) => {
                                return tag_name === 'A'
                                    ? { ...text_value }
                                    : { ...block_style, ...text_value };
                            }
                        );
                        texts.push(...block_texts);
                    }
                }
            }
        }
        if (tag_name === 'A') {
            block_style.children.push(...texts);
            texts = [block_style];
        }
        return texts.length > 0
            ? [
                  {
                      type: this.type,
                      properties: {
                          text: { value: texts },
                      },
                      children: [],
                  },
              ]
            : null;
    }

    override async block2html(
        block: AsyncBlock,
        children: SelectBlock[],
        generateHtml: (el: any[]) => Promise<string>
    ): Promise<string> {
        let content = getTextHtml(block);
        content += await generateHtml(children);
        return `<p>${content}</p>`;
    }
}

export class Heading1Block extends BaseView {
    type = Protocol.Block.Type.heading1;

    View: (prop: CreateView) => JSX.Element = TextView;

    override async onCreate(block: AsyncBlock): Promise<AsyncBlock> {
        if (!block.getProperty('text')) {
            await block.setProperty('text', {
                value: [{ text: '' }],
            });
        }
        return block;
    }

    override html2block(
        el: Element,
        parseEl: (el: Element) => any[]
    ): any[] | null {
        const tag_name = el.tagName;
        if (tag_name === 'H1') {
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
        return `<h1>${content}</h1>`;
    }
}

export class Heading2Block extends BaseView {
    type = Protocol.Block.Type.heading2;

    View: (prop: CreateView) => JSX.Element = TextView;

    override async onCreate(block: AsyncBlock): Promise<AsyncBlock> {
        if (!block.getProperty('text')) {
            await block.setProperty('text', {
                value: [{ text: '' }],
            });
        }
        return block;
    }

    override html2block(
        el: Element,
        parseEl: (el: Element) => any[]
    ): any[] | null {
        const tag_name = el.tagName;
        if (tag_name === 'H2') {
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
        return `<h2>${content}</h2>`;
    }
}

export class Heading3Block extends BaseView {
    type = Protocol.Block.Type.heading3;

    View: (prop: CreateView) => JSX.Element = TextView;

    override async onCreate(block: AsyncBlock): Promise<AsyncBlock> {
        if (!block.getProperty('text')) {
            await block.setProperty('text', {
                value: [{ text: '' }],
            });
        }
        return block;
    }

    override html2block(
        el: Element,
        parseEl: (el: Element) => any[]
    ): any[] | null {
        const tag_name = el.tagName;
        if (tag_name === 'H3') {
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
        return `<h3>${content}</h3>`;
    }
}
