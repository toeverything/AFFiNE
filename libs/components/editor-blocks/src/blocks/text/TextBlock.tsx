import {
    BaseView,
    CreateView,
    AsyncBlock,
    HTML2BlockResult,
    BlockEditor,
} from '@toeverything/framework/virgo';
import { Protocol } from '@toeverything/datasource/db-service';
import { TextView } from './TextView';
import {
    Block2HtmlProps,
    commonBlock2HtmlContent,
    commonHTML2block,
} from '../../utils/commonBlockClip';

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

    override async html2block2({
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
            tagName: [
                'DIV',
                'P',
                'PRE',
                'B',
                'A',
                'EM',
                'U',
                'CODE',
                'S',
                'DEL',
            ],
        });
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
    override async html2block2({
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
            tagName: 'H1',
        });
    }

    override async block2html(props: Block2HtmlProps) {
        return `<h1>${await commonBlock2HtmlContent(props)}</h1>`;
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
    override async html2block2({
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
            tagName: 'H2',
        });
    }

    override async block2html(props: Block2HtmlProps) {
        return `<h2>${await commonBlock2HtmlContent(props)}</h2>`;
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

    override async html2block2({
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
            tagName: 'H3',
        });
    }

    override async block2html(props: Block2HtmlProps) {
        return `<h3>${await commonBlock2HtmlContent(props)}</h3>`;
    }
}
