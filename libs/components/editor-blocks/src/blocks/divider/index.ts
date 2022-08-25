import {
    AsyncBlock,
    BaseView,
    BlockEditor,
    HTML2BlockResult,
    SelectBlock,
} from '@toeverything/framework/virgo';
import { Protocol } from '@toeverything/datasource/db-service';
import { DividerView } from './divider-view';
import { Block2HtmlProps, commonHTML2block } from '../../utils/commonBlockClip';

export class DividerBlock extends BaseView {
    type = Protocol.Block.Type.divider;
    View = DividerView;

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
            tagName: 'HR',
            ignoreEmptyElement: false,
        });
    }

    override async block2html(props: Block2HtmlProps) {
        return `<hr/>`;
    }
}
