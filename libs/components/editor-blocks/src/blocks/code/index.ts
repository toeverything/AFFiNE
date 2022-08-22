import { BaseView, AsyncBlock } from '@toeverything/framework/virgo';
import { Protocol } from '@toeverything/datasource/db-service';
import { CodeView } from './CodeView';
import {
    Block2HtmlProps,
    commonBlock2HtmlContent,
} from '../../utils/commonBlockClip';

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

    override async block2html(props: Block2HtmlProps) {
        return `<code>${await commonBlock2HtmlContent(props)}<code/>`;
    }
}
