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
import { CodeView } from './CodeView';

export class CodeBlock extends BaseView {
    type = Protocol.Block.Type.code;
    public override selectable = true;
    public override editable = true;
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
            tagName: 'CODE',
        });
    }

    override async block2html(props: Block2HtmlProps) {
        return `<code>${await commonBlock2HtmlContent(props)}<code/>`;
    }
}
