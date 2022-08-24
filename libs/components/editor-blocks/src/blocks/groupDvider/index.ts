import {
    AsyncBlock,
    BaseView,
    SelectBlock,
} from '@toeverything/framework/virgo';
import { Protocol } from '@toeverything/datasource/db-service';
import { GroupDividerView } from './groupDividerView';
import { Block2HtmlProps } from '../../utils/commonBlockClip';

export class GroupDividerBlock extends BaseView {
    type = Protocol.Block.Type.groupDivider;
    View = GroupDividerView;

    override async block2html(props: Block2HtmlProps) {
        return `<hr/>`;
    }
}
