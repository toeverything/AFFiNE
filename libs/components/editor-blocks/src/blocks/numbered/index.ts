import {
    DefaultColumnsValue,
    Protocol,
} from '@toeverything/datasource/db-service';
import {
    AsyncBlock,
    BaseView,
    getTextHtml,
    getTextProperties,
    SelectBlock,
} from '@toeverything/framework/virgo';
// import { withTreeViewChildren } from '../../utils/with-tree-view-children';
import { defaultTodoProps, NumberedView } from './NumberedView';

export class NumberedBlock extends BaseView {
    public type = Protocol.Block.Type.numbered;
    // public View = withTreeViewChildren((props: CreateView) => <NumberedView {...props} />);

    // type = Protocol.Block.Type.todo;
    View = NumberedView;

    // override ChildrenView = IndentWrapper;

    override async onCreate(block: AsyncBlock) {
        if (!block.getProperty('text')) {
            await block.setProperties(defaultTodoProps);
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
        if (tag_name === 'OL') {
            const result = [];
            for (let i = 0; i < el.children.length; i++) {
                const blocks_info = parseEl(el.children[i]);
                result.push(...blocks_info);
            }
            return result.length > 0 ? result : null;
        }

        if (tag_name == 'LI' && el.textContent.startsWith('[ ]  ')) {
            const childNodes = el.childNodes;
            let texts = [];
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
            if (texts.length > 0 && (texts[0].text || '').startsWith('[ ]  ')) {
                texts[0].text = texts[0].text.substring('[ ]  '.length);
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
                    children: children,
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
        return `<ol><li>${content}</li></ol>`;
    }
}
