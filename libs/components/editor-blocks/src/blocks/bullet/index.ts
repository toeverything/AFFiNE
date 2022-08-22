import { AsyncBlock, BaseView } from '@toeverything/framework/virgo';
import { Protocol } from '@toeverything/datasource/db-service';
import { defaultBulletProps, BulletView } from './BulletView';
import {
    Block2HtmlProps,
    commonBlock2HtmlContent,
} from '../../utils/commonBlockClip';
export class BulletBlock extends BaseView {
    public type = Protocol.Block.Type.bullet;

    View = BulletView;

    // override ChildrenView = IndentWrapper;

    override async onCreate(block: AsyncBlock) {
        if (!block.getProperty('text')) {
            await block.setProperties(defaultBulletProps);
        }
        return block;
    }

    override html2block(
        el: Element,
        parseEl: (el: Element) => any[]
    ): any[] | null {
        const tag_name = el.tagName;
        if (tag_name === 'UL') {
            const result = [];
            for (let i = 0; i < el.children.length; i++) {
                const blocks_info = parseEl(el.children[i]);
                result.push(...blocks_info);
            }
            return result.length > 0 ? result : null;
        }

        if (tag_name == 'LI' && !el.textContent.startsWith('[ ]  ')) {
            const childNodes = el.childNodes;
            const texts = [];
            const children = [];
            for (let i = 0; i < childNodes.length; i++) {
                const blocks_info = parseEl(childNodes[i] as Element);
                for (let j = 0; j < blocks_info.length; j++) {
                    if (blocks_info[j].type === 'text') {
                        const block_texts =
                            blocks_info[j].properties.text.value;
                        texts.push(...block_texts);
                    } else {
                        children.push(blocks_info[j]);
                    }
                }
            }
            return [
                {
                    type: this.type,
                    properties: {
                        text: { value: texts },
                    },
                    children: children,
                },
            ];
        }

        return null;
    }

    override async block2html(props: Block2HtmlProps) {
        return `<ul><li>${await commonBlock2HtmlContent(props)}</li></ul>`;
    }
}
