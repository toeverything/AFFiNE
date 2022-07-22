import {
    BaseView,
    AsyncBlock,
    getTextProperties,
    CreateView,
    SelectBlock,
    getTextHtml,
} from '@toeverything/framework/virgo';
import {
    Protocol,
    DefaultColumnsValue,
} from '@toeverything/datasource/db-service';
import { CodeView } from './CodeView';
import { ComponentType } from 'react';

export class CodeBlock extends BaseView {
    type = Protocol.Block.Type.code;
    public override selectable = true;
    public override activatable = false;
    // View = CodeView;
    View = CodeView;
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

    // TODO: internal format not implemented yet
    override html2block(
        el: Element,
        parseEl: (el: Element) => any[]
    ): any[] | null {
        const tag_name = el.tagName;
        if (tag_name === 'CODE') {
            const childNodes = el.childNodes;
            let text_value = '';
            for (let i = 0; i < childNodes.length; i++) {
                const blocks_info = parseEl(childNodes[i] as Element);
                for (let j = 0; j < blocks_info.length; j++) {
                    if (blocks_info[j].type === 'text') {
                        const block_texts =
                            blocks_info[j].properties.text.value;
                        if (block_texts.length > 0) {
                            text_value += block_texts[0].text;
                        }
                    }
                }
            }
            return [
                {
                    type: this.type,
                    properties: {
                        text: { value: [{ text: text_value }] },
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
        return `<code>${content}</code>`;
    }
}
