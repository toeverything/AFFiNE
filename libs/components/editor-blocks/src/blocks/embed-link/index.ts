import {
    AsyncBlock,
    BaseView,
    SelectBlock,
} from '@toeverything/framework/virgo';
import { Protocol } from '@toeverything/datasource/db-service';
import { EmbedLinkView } from './EmbedLinkView';
import { Block2HtmlProps } from '../../utils/commonBlockClip';

export class EmbedLinkBlock extends BaseView {
    public override selectable = true;
    public override activatable = false;
    type = Protocol.Block.Type.embedLink;
    View = EmbedLinkView;

    override async block2html({ block }: Block2HtmlProps) {
        const url = block.getProperty('embedLink')?.value;
        return `<p><a href="${url}">${url}</a></p>`;
    }
}
