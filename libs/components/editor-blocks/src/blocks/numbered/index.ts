import { Protocol } from '@toeverything/datasource/db-service';
import {
    AsyncBlock,
    BaseView,
    BlockEditor,
    HTML2BlockResult,
} from '@toeverything/framework/virgo';
import {
    Block2HtmlProps,
    commonBlock2HtmlContent,
    commonHTML2block,
} from '../../utils/commonBlockClip';
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

    override async html2block({
        element,
        editor,
    }: {
        element: Element;
        editor: BlockEditor;
    }): Promise<HTML2BlockResult> {
        if (element.tagName === 'OL') {
            const children = Array.from(element.children);
            const childrenBlockInfos = (
                await Promise.all(
                    children.map(childElement =>
                        this.html2block({
                            editor,
                            element: childElement,
                        })
                    )
                )
            )
                .flat()
                .filter(v => v);
            return childrenBlockInfos.length ? childrenBlockInfos : null;
        }

        return commonHTML2block({
            element,
            editor,
            type: this.type,
            tagName: 'LI',
        });
    }

    override async block2html(props: Block2HtmlProps) {
        return `<ol><li>${await commonBlock2HtmlContent(props)}</li></ol>`;
    }
}
