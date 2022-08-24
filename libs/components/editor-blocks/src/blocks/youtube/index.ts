import { Protocol } from '@toeverything/datasource/db-service';
import {
    AsyncBlock,
    BaseView,
    SelectBlock,
} from '@toeverything/framework/virgo';
import { YoutubeView } from './YoutubeView';
import {
    Block2HtmlProps,
    commonBlock2HtmlContent,
} from '../../utils/commonBlockClip';

export class YoutubeBlock extends BaseView {
    public override selectable = true;
    public override activatable = false;
    type = Protocol.Block.Type.youtube;
    View = YoutubeView;

    override async block2Text(block: AsyncBlock, selectInfo: SelectBlock) {
        return block.getProperty('embedLink')?.value ?? '';
    }
    override async block2html({ block }: Block2HtmlProps) {
        const url = block.getProperty('embedLink')?.value;
        return `<p><a href="${url}">${url}</a></p>`;
    }
}
