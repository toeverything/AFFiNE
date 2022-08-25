import { Protocol } from '@toeverything/datasource/db-service';
import {
    AsyncBlock,
    BaseView,
    BlockEditor,
    CreateView,
    HTML2BlockResult,
} from '@toeverything/framework/virgo';
import {
    Block2HtmlProps,
    commonBlock2HtmlContent,
    commonHTML2block,
} from '../../utils/commonBlockClip';

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

    override async html2block({
        element,
        editor,
    }: {
        element: Element;
        editor: BlockEditor;
    }): Promise<HTML2BlockResult> {
        return commonHTML2block({
            element,
            editor,
            type: this.type,
            tagName: 'BLOCKQUOTE',
        });
    }

    override async block2html(props: Block2HtmlProps) {
        return `<blockquote>${await commonBlock2HtmlContent(
            props
        )}</blockquote>`;
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

    override async html2block({
        element,
        editor,
    }: {
        element: Element;
        editor: BlockEditor;
    }): Promise<HTML2BlockResult> {
        return commonHTML2block({
            element,
            editor,
            type: this.type,
            tagName: 'ASIDE',
        });
    }

    override async block2html(props: Block2HtmlProps) {
        return `<aside>${await commonBlock2HtmlContent(props)}</aside>`;
    }
}
