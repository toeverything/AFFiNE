import { Protocol } from '@toeverything/datasource/db-service';
import {
    BaseView,
    BlockEditor,
    HTML2BlockResult,
    withTreeViewChildren,
} from '@toeverything/framework/virgo';
import { defaultTodoProps, TodoView } from './TodoView';

import {
    Block2HtmlProps,
    commonBlock2HtmlContent,
    commonHTML2block,
} from '../../utils/commonBlockClip';
import type { TodoAsyncBlock } from './types';

export class TodoBlock extends BaseView {
    type = Protocol.Block.Type.todo;
    // View = withTreeViewChildren((props: CreateView) => <TodoView {...props} />);
    View = withTreeViewChildren(TodoView);
    // //
    // override ChildrenView = WithTreeViewChildren;

    override async onCreate(block: TodoAsyncBlock) {
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
        if (element.tagName === 'UL') {
            const firstList = element.querySelector('li');
            if (!firstList || !firstList.innerText.startsWith('[ ]  ')) {
                return null;
            }

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
        return `<ul><li>[ ] ${await commonBlock2HtmlContent(props)}</li></ul>`;
    }
}
